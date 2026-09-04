"use strict";

const { getAuth } = require("firebase-admin/auth");
const { ensureApp, db, serverTimestamp } = require("./lib/adminApp");
const { onCall, HttpsError, CALLABLE, CALLABLE_MAIL, wrapCallable } = require("./lib/callable");
const {
  normalizeEmail,
  isValidEmail,
  emailDocId,
  generateSixDigitCode,
  isCodeExpired,
  canResend,
  tooManyAttempts,
  nextExpiry,
} = require("./lib/signupCodes");
const { evaluateConfirmReset, applyPasswordUpdate, hashResetCode } = require("./lib/passwordReset");
const { requireEmailConfigured, sendMail, logMailFailure, resetPasswordEmailHtml, resetPasswordEmailText } = require("./lib/mailer");
const { t, localeFromRequest, normalizeLocale } = require("./lib/i18n");

function auth() {
  return getAuth(ensureApp());
}

function resetCodeRef(email) {
  return db().collection("reset_codes").doc(emailDocId(email));
}

function fail(status, locale, key) {
  throw new HttpsError(status, t(locale, key), { key });
}

async function findUserByEmail(email) {
  try {
    return await auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") return null;
    throw err;
  }
}

exports.requestPasswordReset = onCall(
  CALLABLE_MAIL,
  wrapCallable("requestPasswordReset", async (request) => {
    const locale = localeFromRequest(request);
    const email = normalizeEmail(request.data?.email);
    if (!isValidEmail(email)) fail("invalid-argument", locale, "err.invalidEmail");

    try {
      requireEmailConfigured(locale);
    } catch (err) {
      fail("failed-precondition", locale, "err.emailNotConfigured");
    }

    ensureApp();
    const now = Date.now();
    const ref = resetCodeRef(email);
    const existing = await ref.get();
    const record = existing.exists ? existing.data() : null;
    if (record && !isCodeExpired(record, now) && !canResend(record, now)) {
      fail("resource-exhausted", locale, "err.resendWait");
    }

    const user = await findUserByEmail(email);
    const canSend = !!(user && !user.disabled);

    if (!canSend) {
      await ref.set(
        {
          uid: null,
          emailHash: emailDocId(email),
          codeHash: null,
          attempts: 0,
          expiresAtMs: nextExpiry(now),
          lastSentAtMs: now,
          locale: normalizeLocale(locale),
          updatedAt: serverTimestamp(),
          createdAt: record?.createdAt || serverTimestamp(),
        },
        { merge: true }
      );
      return { ok: true };
    }

    const code = generateSixDigitCode();
    await ref.set({
      uid: user.uid,
      emailHash: emailDocId(email),
      codeHash: hashResetCode(code),
      attempts: 0,
      expiresAtMs: nextExpiry(now),
      lastSentAtMs: now,
      locale: normalizeLocale(locale),
      updatedAt: serverTimestamp(),
      createdAt: record?.createdAt || serverTimestamp(),
    });

    try {
      await sendMail({
        to: email,
        locale,
        subject: t(locale, "email.reset.subject"),
        html: resetPasswordEmailHtml(code, locale),
        text: resetPasswordEmailText(code, locale),
      });
    } catch (err) {
      if (err?.code === "EMAIL_NOT_CONFIGURED") fail("failed-precondition", locale, "err.emailNotConfigured");
      logMailFailure("requestPasswordReset mail failed", err);
      await ref.set({ lastSentAtMs: 0, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      fail("unavailable", locale, "err.resetMailFailed");
    }

    return { ok: true };
  })
);

exports.confirmPasswordReset = onCall(
  CALLABLE,
  wrapCallable("confirmPasswordReset", async (request) => {
    const locale = localeFromRequest(request);
    const email = normalizeEmail(request.data?.email);
    const code = String(request.data?.code || "").trim();
    const password = request.data?.password;
    if (!isValidEmail(email)) fail("invalid-argument", locale, "err.invalidEmail");

    ensureApp();
    const now = Date.now();
    const ref = resetCodeRef(email);
    const snap = await ref.get();
    const record = snap.exists ? snap.data() : null;
    const result = evaluateConfirmReset({ record, code, password, now });

    if (result.reason === "mismatch" && record && !isCodeExpired(record, now) && !tooManyAttempts(record)) {
      await ref.set({ attempts: Number(record.attempts || 0) + 1, updatedAt: serverTimestamp() }, { merge: true });
    }

    if (!result.ok) {
      if (result.reason === "weak-password") fail("invalid-argument", locale, "err.weakPassword");
      if (result.reason === "code-required") fail("invalid-argument", locale, "err.codeSixDigits");
      if (result.reason === "expired" || result.reason === "missing") fail("deadline-exceeded", locale, "err.codeExpired");
      if (result.reason === "locked") fail("resource-exhausted", locale, "err.codeLocked");
      fail("permission-denied", locale, "err.codeWrong");
    }

    try {
      await applyPasswordUpdate((uid, data) => auth().updateUser(uid, data), result.uid, password);
    } catch (err) {
      const mappedCode = String(err?.code || "");
      if (mappedCode === "auth/weak-password" || mappedCode === "auth/invalid-password") {
        fail("invalid-argument", locale, "err.weakPassword");
      }
      if (mappedCode === "auth/user-not-found") fail("failed-precondition", locale, "err.accountMissing");
      throw err;
    }

    await ref.delete().catch(() => {});
    return { ok: true };
  })
);
