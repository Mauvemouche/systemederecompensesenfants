"use strict";

const { getAuth } = require("firebase-admin/auth");
const { ensureApp, db, serverTimestamp } = require("./lib/adminApp");
const { onCall, HttpsError, CALLABLE, wrapCallable } = require("./lib/callable");
const { hashSecret, verifySecret } = require("./lib/secretHash");
const {
  normalizeEmail,
  isValidEmail,
  isValidSignupPassword,
  emailDocId,
  generateSixDigitCode,
  isValidSixDigitCode,
  isCodeExpired,
  canResend,
  tooManyAttempts,
  nextExpiry,
  evaluateVerify,
} = require("./lib/signupCodes");
const { requireEmailConfigured, sendMail, welcomeVerifyEmailHtml, welcomeVerifyEmailText } = require("./lib/mailer");
const { t, localeFromRequest, normalizeLocale } = require("./lib/i18n");

function auth() {
  return getAuth(ensureApp());
}

function signupCodeRef(email) {
  return db().collection("signup_codes").doc(emailDocId(email));
}

function fail(status, locale, key) {
  throw new HttpsError(status, t(locale, key), { key });
}

function mappedAuthError(err, locale) {
  const code = String(err?.code || "");
  if (code === "auth/email-already-exists") return new HttpsError("already-exists", t(locale, "err.emailInUse"), { key: "err.emailInUse" });
  if (code === "auth/invalid-email") return new HttpsError("invalid-argument", t(locale, "err.invalidEmail"), { key: "err.invalidEmail" });
  if (code === "auth/weak-password" || code === "auth/invalid-password") {
    return new HttpsError("invalid-argument", t(locale, "err.weakPassword"), { key: "err.weakPassword" });
  }
  return null;
}

async function findUserByEmail(email, locale) {
  try {
    return await auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") return null;
    const mapped = mappedAuthError(err, locale);
    if (mapped) throw mapped;
    throw err;
  }
}

async function persistAndSendCode({ email, uid, now, locale }) {
  const code = generateSixDigitCode();
  const expiresAtMs = nextExpiry(now);
  await signupCodeRef(email).set({
    uid,
    emailHash: emailDocId(email),
    codeHash: hashSecret(code),
    attempts: 0,
    expiresAtMs,
    lastSentAtMs: now,
    locale,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  await sendMail({
    to: email,
    locale,
    subject: t(locale, "email.welcome.subject"),
    html: welcomeVerifyEmailHtml(code, locale),
    text: welcomeVerifyEmailText(code, locale),
  });
}

exports.requestSignup = onCall(
  CALLABLE,
  wrapCallable("requestSignup", async (request) => {
    const locale = localeFromRequest(request);
    const email = normalizeEmail(request.data?.email);
    const password = request.data?.password;
    if (!isValidEmail(email)) fail("invalid-argument", locale, "err.invalidEmail");
    if (!isValidSignupPassword(password)) fail("invalid-argument", locale, "err.weakPassword");
    if (request.data?.acceptedLegal !== true) fail("failed-precondition", locale, "err.acceptedLegal");

    try {
      requireEmailConfigured(locale);
    } catch (err) {
      fail("failed-precondition", locale, "err.emailNotConfigured");
    }

    ensureApp();
    const now = Date.now();
    let user = await findUserByEmail(email, locale);

    if (user && !user.disabled) fail("already-exists", locale, "err.emailInUse");

    const existingCode = await signupCodeRef(email).get();
    const record = existingCode.exists ? existingCode.data() : null;
    if (record && !isCodeExpired(record, now) && !canResend(record, now)) {
      fail("resource-exhausted", locale, "err.resendWait");
    }

    if (user) {
      try {
        await auth().updateUser(user.uid, { password, disabled: true });
      } catch (err) {
        const mapped = mappedAuthError(err, locale);
        if (mapped) throw mapped;
        throw err;
      }
    } else {
      try {
        user = await auth().createUser({
          email,
          password,
          disabled: true,
          emailVerified: false,
        });
      } catch (err) {
        const mapped = mappedAuthError(err, locale);
        if (mapped) throw mapped;
        throw err;
      }
    }

    try {
      await persistAndSendCode({ email, uid: user.uid, now, locale });
    } catch (err) {
      if (err?.code === "EMAIL_NOT_CONFIGURED") fail("failed-precondition", locale, "err.emailNotConfigured");
      console.error("requestSignup mail failed");
      await signupCodeRef(email)
        .set({ lastSentAtMs: 0, updatedAt: serverTimestamp() }, { merge: true })
        .catch(() => {});
      fail("unavailable", locale, "err.verifyMailFailed");
    }

    return { ok: true, email, locale };
  })
);

exports.verifyEmailCode = onCall(
  CALLABLE,
  wrapCallable("verifyEmailCode", async (request) => {
    const locale = localeFromRequest(request);
    const email = normalizeEmail(request.data?.email);
    const code = String(request.data?.code || "").trim();
    if (!isValidEmail(email)) fail("invalid-argument", locale, "err.invalidEmail");
    if (!isValidSixDigitCode(code)) fail("invalid-argument", locale, "err.codeSixDigits");

    ensureApp();
    const now = Date.now();
    const ref = signupCodeRef(email);
    const snap = await ref.get();
    const record = snap.exists ? snap.data() : null;
    const matches = !!(record?.codeHash && verifySecret(code, record.codeHash));
    const result = evaluateVerify(record, matches, now);

    if (result.reason === "mismatch" && record && !isCodeExpired(record, now) && !tooManyAttempts(record)) {
      await ref.set({ attempts: Number(record.attempts || 0) + 1, updatedAt: serverTimestamp() }, { merge: true });
    }

    if (!result.ok) {
      if (result.reason === "expired" || result.reason === "missing") fail("deadline-exceeded", locale, "err.codeExpired");
      if (result.reason === "locked") fail("resource-exhausted", locale, "err.codeLocked");
      fail("permission-denied", locale, "err.codeWrong");
    }

    const uid = record.uid;
    if (!uid) fail("failed-precondition", locale, "err.accountMissing");

    try {
      await auth().updateUser(uid, { disabled: false, emailVerified: true });
    } catch (err) {
      const mapped = mappedAuthError(err, locale);
      if (mapped) throw mapped;
      throw err;
    }

    const savedLocale = normalizeLocale(record.locale || locale);
    await ref.delete().catch(() => {});

    let token = null;
    try {
      token = await auth().createCustomToken(uid);
    } catch (err) {
      console.error("verifyEmailCode custom token failed");
    }

    return { ok: true, token, locale: savedLocale };
  })
);
