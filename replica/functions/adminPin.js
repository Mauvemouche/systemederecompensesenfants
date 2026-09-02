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
const {
  EMAIL_NOT_CONFIGURED_FR,
  requireEmailConfigured,
  sendMail,
  recoverPinEmailHtml,
  recoverPinEmailText,
} = require("./lib/mailer");

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

async function requireFamily(uid) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) {
    throw new HttpsError("failed-precondition", "Famille non initialisée.");
  }
  const billing = await readFamilyBilling(familyId);
  const settings = await readFamilySettings(familyId);
  return { familyId, billing, settings };
}

function requireOwner(uid, billing) {
  if (!billing?.ownerUid) {
    throw new HttpsError("failed-precondition", "Famille non initialisée.");
  }
  if (billing.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "Seul le parent titulaire peut faire ça.");
  }
}

function pinError() {
  throw new HttpsError("invalid-argument", "Le code Admin doit contenir 4 chiffres.");
}

exports.setAdminPin = onCall(
  CALLABLE,
  wrapCallable("setAdminPin", async (request) => {
    const { uid } = requireAuth(request);
    const pin = String(request.data?.pin || "").trim();
    if (!isFourDigitPin(pin)) pinError();

    ensureApp();
    const { familyId, billing, settings } = await requireFamily(uid);
    requireOwner(uid, billing);
    if (settings?.adminPinHash) {
      throw new HttpsError(
        "failed-precondition",
        "Un code Admin existe déjà. Utilise « Changer le code Admin »."
      );
    }

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
    const { uid } = requireAuth(request);
    const pin = String(request.data?.pin || "").trim();
    if (!isFourDigitPin(pin)) pinError();

    ensureApp();
    const { familyId, settings } = await requireFamily(uid);
    const hash = settings?.adminPinHash;
    if (!hash) {
      throw new HttpsError("failed-precondition", "Choisis d’abord un code Admin.");
    }
    if (Number(settings.adminPinAttempts || 0) >= PIN_VERIFY_MAX) {
      throw new HttpsError(
        "resource-exhausted",
        "Trop d’essais. Utilise « Récupérer le code Admin » ou réessaie plus tard."
      );
    }

    if (!verifySecret(pin, hash)) {
      await settingsRef(familyId).set(
        {
          adminPinAttempts: Number(settings.adminPinAttempts || 0) + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      throw new HttpsError("permission-denied", "Code incorrect.");
    }

    await settingsRef(familyId).set({ adminPinAttempts: 0, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true, adminToken: createAdminToken(familyId, uid, hash) };
  })
);

exports.changeAdminPin = onCall(
  CALLABLE,
  wrapCallable("changeAdminPin", async (request) => {
    const { uid } = requireAuth(request);
    const newPin = String(request.data?.newPin || "").trim();
    const currentPin = String(request.data?.currentPin || "").trim();
    const adminToken = request.data?.adminToken;
    if (!isFourDigitPin(newPin)) pinError();

    ensureApp();
    const { familyId, billing, settings } = await requireFamily(uid);
    requireOwner(uid, billing);
    const hash = settings?.adminPinHash;
    if (!hash) {
      throw new HttpsError("failed-precondition", "Choisis d’abord un code Admin.");
    }

    const alreadyAdmin = adminTokenValid(adminToken, familyId, uid, hash);
    if (!alreadyAdmin) {
      if (!isFourDigitPin(currentPin) || !verifySecret(currentPin, hash)) {
        throw new HttpsError("permission-denied", "Code actuel incorrect.");
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
    const { familyId, billing, settings } = await requireFamily(uid);
    const ownerEmail = String(billing?.ownerEmail || "").trim();
    if (!ownerEmail) {
      throw new HttpsError("failed-precondition", "Aucun email titulaire pour envoyer le code.");
    }

    const now = Date.now();
    const last = Number(settings?.lastAdminPinRecoverAtMs || 0);
    if (last && now - last < RECOVER_COOLDOWN_MS) {
      throw new HttpsError(
        "resource-exhausted",
        "Un email de récupération a déjà été envoyé. Réessaie dans 15 minutes."
      );
    }

    try {
      requireEmailConfigured();
    } catch (_) {
      throw new HttpsError("failed-precondition", EMAIL_NOT_CONFIGURED_FR);
    }

    const pin = generateFourDigitPin();
    try {
      await sendMail({
        to: ownerEmail,
        subject: "Nouveau code Admin",
        html: recoverPinEmailHtml(pin),
        text: recoverPinEmailText(pin),
      });
    } catch (err) {
      if (err?.code === "EMAIL_NOT_CONFIGURED") {
        throw new HttpsError("failed-precondition", EMAIL_NOT_CONFIGURED_FR);
      }
      console.error("recoverAdminPin mail failed");
      throw new HttpsError("unavailable", "Impossible d’envoyer l’email. Réessaie dans un instant.");
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

    return { ok: true };
  })
);
