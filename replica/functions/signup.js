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
const {
  EMAIL_NOT_CONFIGURED_FR,
  requireEmailConfigured,
  sendMail,
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
} = require("./lib/mailer");

function auth() {
  return getAuth(ensureApp());
}

function signupCodeRef(email) {
  return db().collection("signup_codes").doc(emailDocId(email));
}

function frenchAuthError(err) {
  const code = String(err?.code || "");
  if (code === "auth/email-already-exists") {
    return new HttpsError("already-exists", "Cet email est déjà utilisé. Connecte-toi.");
  }
  if (code === "auth/invalid-email") {
    return new HttpsError("invalid-argument", "Email invalide.");
  }
  if (code === "auth/weak-password" || code === "auth/invalid-password") {
    return new HttpsError("invalid-argument", "Mot de passe trop faible (6 caractères min.).");
  }
  return null;
}

async function findUserByEmail(email) {
  try {
    return await auth().getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") return null;
    const mapped = frenchAuthError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

async function sendVerifyEmail(email, code) {
  await sendMail({
    to: email,
    subject: "Bienvenue — ton code de vérification",
    html: welcomeVerifyEmailHtml(code),
    text: welcomeVerifyEmailText(code),
  });
}

async function persistAndSendCode({ email, uid, now }) {
  const code = generateSixDigitCode();
  const expiresAtMs = nextExpiry(now);
  await signupCodeRef(email).set({
    uid,
    emailHash: emailDocId(email),
    codeHash: hashSecret(code),
    attempts: 0,
    expiresAtMs,
    lastSentAtMs: now,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  await sendVerifyEmail(email, code);
}

exports.requestSignup = onCall(
  CALLABLE,
  wrapCallable("requestSignup", async (request) => {
    const email = normalizeEmail(request.data?.email);
    const password = request.data?.password;
    if (!isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Email invalide.");
    }
    if (!isValidSignupPassword(password)) {
      throw new HttpsError("invalid-argument", "Mot de passe trop faible (6 caractères min.).");
    }

    try {
      requireEmailConfigured();
    } catch (err) {
      throw new HttpsError("failed-precondition", EMAIL_NOT_CONFIGURED_FR);
    }

    ensureApp();
    const now = Date.now();
    let user = await findUserByEmail(email);

    if (user && !user.disabled) {
      throw new HttpsError("already-exists", "Cet email est déjà utilisé. Connecte-toi.");
    }

    const existingCode = await signupCodeRef(email).get();
    const record = existingCode.exists ? existingCode.data() : null;
    if (record && !isCodeExpired(record, now) && !canResend(record, now)) {
      throw new HttpsError("resource-exhausted", "Attends une minute avant de renvoyer le code.");
    }

    if (user) {
      try {
        await auth().updateUser(user.uid, { password, disabled: true });
      } catch (err) {
        const mapped = frenchAuthError(err);
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
        const mapped = frenchAuthError(err);
        if (mapped) throw mapped;
        throw err;
      }
    }

    try {
      await persistAndSendCode({ email, uid: user.uid, now });
    } catch (err) {
      if (err?.code === "EMAIL_NOT_CONFIGURED") {
        throw new HttpsError("failed-precondition", EMAIL_NOT_CONFIGURED_FR);
      }
      console.error("requestSignup mail failed");
      await signupCodeRef(email)
        .set({ lastSentAtMs: 0, updatedAt: serverTimestamp() }, { merge: true })
        .catch(() => {});
      throw new HttpsError(
        "unavailable",
        "Impossible d’envoyer l’email de vérification. Réessaie dans un instant."
      );
    }

    return { ok: true, email };
  })
);

exports.verifyEmailCode = onCall(
  CALLABLE,
  wrapCallable("verifyEmailCode", async (request) => {
    const email = normalizeEmail(request.data?.email);
    const code = String(request.data?.code || "").trim();
    if (!isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Email invalide.");
    }
    if (!isValidSixDigitCode(code)) {
      throw new HttpsError("invalid-argument", "Le code doit contenir 6 chiffres.");
    }

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
      if (result.reason === "expired" || result.reason === "missing") {
        throw new HttpsError("deadline-exceeded", "Ce code a expiré. Demande-en un nouveau.");
      }
      if (result.reason === "locked") {
        throw new HttpsError("resource-exhausted", "Trop d’essais. Demande un nouveau code.");
      }
      throw new HttpsError("permission-denied", "Code incorrect.");
    }

    const uid = record.uid;
    if (!uid) {
      throw new HttpsError("failed-precondition", "Compte introuvable. Recommence l’inscription.");
    }

    try {
      await auth().updateUser(uid, { disabled: false, emailVerified: true });
    } catch (err) {
      const mapped = frenchAuthError(err);
      if (mapped) throw mapped;
      throw err;
    }

    await ref.delete().catch(() => {});

    let token = null;
    try {
      token = await auth().createCustomToken(uid);
    } catch (err) {
      console.error("verifyEmailCode custom token failed");
    }

    return { ok: true, token };
  })
);
