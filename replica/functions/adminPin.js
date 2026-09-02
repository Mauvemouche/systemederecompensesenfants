"use strict";

const { ensureApp, serverTimestamp } = require("./lib/adminApp");
const { onCall, HttpsError, CALLABLE, wrapCallable, requireAuth } = require("./lib/callable");
const { hashSecret, verifySecret } = require("./lib/secretHash");
const {
  isFourDigitPin,
  generateFourDigitPin,
  createAdminToken,
  adminTokenValid,
} = require("./lib/adminPinFormat");
const { memberRef, settingsRef, readFamilyBilling, readFamilySettings } = require("./lib/families");
const { serializeState } = require("./lib/replicaState");
const { requireEmailConfigured, sendMail, recoverPinEmailHtml, recoverPinEmailText } = require("./lib/mailer");
const { t, localeFromRequest } = require("./lib/i18n");

const RECOVER_COOLDOWN_MS = 15 * 60 * 1000;
const PIN_VERIFY_MAX = 10;

function instanceId() {
  return process.env.GCLOUD_PROJECT || ensureApp().options.projectId || "replica";
}

async function loadState(familyId, uid) {
  return serializeState(familyId, await readFamilyBilling(familyId), await readFamilySettings(familyId), uid, {
    instanceId: instanceId(),
  });
}

function fail(status, locale, key) {
  throw new HttpsError(status, t(locale, key), { key });
}

async function requireFamily(uid, locale) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) fail("failed-precondition", locale, "err.familyMissing");
  const billing = await readFamilyBilling(familyId);
  const settings = await readFamilySettings(familyId);
  return { familyId, billing, settings };
}

function requireOwner(uid, billing, locale) {
  if (!billing?.ownerUid) fail("failed-precondition", locale, "err.familyMissing");
  if (billing.ownerUid !== uid) fail("permission-denied", locale, "err.ownerOnly");
}

exports.setAdminPin = onCall(
  CALLABLE,
  wrapCallable("setAdminPin", async (request) => {
    const locale = localeFromRequest(request);
    const { uid } = requireAuth(request);
    const pin = String(request.data?.pin || "").trim();
    if (!isFourDigitPin(pin)) fail("invalid-argument", locale, "err.pinFourDigits");

    ensureApp();
    const { familyId, billing, settings } = await requireFamily(uid, locale);
    requireOwner(uid, billing, locale);
    if (settings?.adminPinHash) fail("failed-precondition", locale, "err.pinExists");

    await settingsRef(familyId).set(
      {
        adminPinHash: hashSecret(pin),
        adminPinAttempts: 0,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return loadState(familyId, uid);
  })
);

exports.verifyAdminPin = onCall(
  CALLABLE,
  wrapCallable("verifyAdminPin", async (request) => {
    const locale = localeFromRequest(request);
    const { uid } = requireAuth(request);
    const pin = String(request.data?.pin || "").trim();
    if (!isFourDigitPin(pin)) fail("invalid-argument", locale, "err.pinFourDigits");

    ensureApp();
    const { familyId, settings } = await requireFamily(uid, locale);
    const hash = settings?.adminPinHash;
    if (!hash) fail("failed-precondition", locale, "err.pinChooseFirst");
    if (Number(settings.adminPinAttempts || 0) >= PIN_VERIFY_MAX) {
      fail("resource-exhausted", locale, "err.pinLocked");
    }

    if (!verifySecret(pin, hash)) {
      await settingsRef(familyId).set(
        {
          adminPinAttempts: Number(settings.adminPinAttempts || 0) + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      fail("permission-denied", locale, "err.pinWrong");
    }

    await settingsRef(familyId).set({ adminPinAttempts: 0, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true, adminToken: createAdminToken(familyId, uid, hash) };
  })
);

exports.changeAdminPin = onCall(
  CALLABLE,
  wrapCallable("changeAdminPin", async (request) => {
    const locale = localeFromRequest(request);
    const { uid } = requireAuth(request);
    const newPin = String(request.data?.newPin || "").trim();
    const currentPin = String(request.data?.currentPin || "").trim();
    const adminToken = request.data?.adminToken;
    if (!isFourDigitPin(newPin)) fail("invalid-argument", locale, "err.pinFourDigits");

    ensureApp();
    const { familyId, billing, settings } = await requireFamily(uid, locale);
    requireOwner(uid, billing, locale);
    const hash = settings?.adminPinHash;
    if (!hash) fail("failed-precondition", locale, "err.pinChooseFirst");

    const alreadyAdmin = adminTokenValid(adminToken, familyId, uid, hash);
    if (!alreadyAdmin) {
      if (!isFourDigitPin(currentPin) || !verifySecret(currentPin, hash)) {
        fail("permission-denied", locale, "err.pinCurrentWrong");
      }
    }

    const nextHash = hashSecret(newPin);
    await settingsRef(familyId).set(
      {
        adminPinHash: nextHash,
        adminPinAttempts: 0,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, adminToken: createAdminToken(familyId, uid, nextHash) };
  })
);

exports.recoverAdminPin = onCall(
  CALLABLE,
  wrapCallable("recoverAdminPin", async (request) => {
    const { uid } = requireAuth(request);
    ensureApp();
    const earlyLocale = localeFromRequest(request);
    const { familyId, billing, settings } = await requireFamily(uid, earlyLocale);
    const locale = localeFromRequest(request, settings?.locale);
    const ownerEmail = String(billing?.ownerEmail || "").trim();
    if (!ownerEmail) fail("failed-precondition", locale, "err.noOwnerEmail");

    const now = Date.now();
    const last = Number(settings?.lastAdminPinRecoverAtMs || 0);
    if (last && now - last < RECOVER_COOLDOWN_MS) fail("resource-exhausted", locale, "err.recoverWait");

    try {
      requireEmailConfigured(locale);
    } catch (_) {
      fail("failed-precondition", locale, "err.emailNotConfigured");
    }

    const pin = generateFourDigitPin();
    try {
      await sendMail({
        to: ownerEmail,
        locale,
        subject: t(locale, "email.recover.subject"),
        html: recoverPinEmailHtml(pin, locale),
        text: recoverPinEmailText(pin, locale),
      });
    } catch (err) {
      if (err?.code === "EMAIL_NOT_CONFIGURED") fail("failed-precondition", locale, "err.emailNotConfigured");
      console.error("recoverAdminPin mail failed");
      fail("unavailable", locale, "err.mailFailed");
    }

    await settingsRef(familyId).set(
      {
        adminPinHash: hashSecret(pin),
        adminPinAttempts: 0,
        lastAdminPinRecoverAtMs: now,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, locale };
  })
);
