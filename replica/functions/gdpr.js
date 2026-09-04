"use strict";

const { getAuth } = require("firebase-admin/auth");
const { ensureApp, db, serverTimestamp } = require("./lib/adminApp");
const { onCall, HttpsError, CALLABLE, CALLABLE_STRIPE, requireAuth, wrapCallable } = require("./lib/callable");
const { t, localeFromRequest } = require("./lib/i18n");
const {
  familyRef,
  memberRef,
  readFamilyBilling,
  readFamilySettings,
} = require("./lib/families");
const { stripeRequest } = require("./lib/stripeHttp");
const {
  FAMILY_SUBCOLLECTIONS,
  buildFamilyExport,
  stripeSubscriptionCancelPath,
  relatedDocsToDelete,
} = require("./lib/gdpr");

function fail(status, locale, key) {
  throw new HttpsError(status, t(locale, key), { key });
}

async function requireFamilyOwner(uid, locale) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) fail("failed-precondition", locale, "err.familyMissing");
  const billing = await readFamilyBilling(familyId);
  if (!billing?.ownerUid) fail("failed-precondition", locale, "err.familyMissing");
  if (billing.ownerUid !== uid) fail("permission-denied", locale, "err.ownerOnly");
  return { familyId, billing };
}

async function readCollectionDocs(colRef) {
  const snap = await colRef.get();
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

async function deleteCollectionDocs(colRef) {
  const snap = await colRef.get();
  const docs = snap.docs;
  const size = 400;
  for (let i = 0; i < docs.length; i += size) {
    const batch = db().batch();
    docs.slice(i, i + size).forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }
  return docs.length;
}

async function cancelFamilySubscription(billing, locale) {
  const path = stripeSubscriptionCancelPath(billing?.stripeSubscriptionId);
  if (!path) return { canceled: false, skipped: true };
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) fail("failed-precondition", locale, "err.deleteFailed");
  try {
    await stripeRequest("DELETE", path, {}, secret);
    return { canceled: true };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/already been canceled|No such subscription|resource_missing/i.test(msg)) {
      return { canceled: false, alreadyCanceled: true };
    }
    console.error("deleteFamilyAccount Stripe cancel failed", err?.message || err);
    fail("unavailable", locale, "err.deleteFailed");
  }
  return { canceled: false };
}

async function deleteFamilyTree(familyId, uid, billing) {
  const famRef = familyRef(familyId);
  for (const name of FAMILY_SUBCOLLECTIONS) {
    await deleteCollectionDocs(famRef.collection(name));
  }
  await famRef.delete().catch(() => {});
  for (const doc of relatedDocsToDelete(familyId, uid, billing?.stripeCustomerId)) {
    await db().collection(doc.collection).doc(doc.id).delete().catch(() => {});
  }
}

exports.exportFamilyData = onCall(
  CALLABLE,
  wrapCallable("exportFamilyData", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    ensureApp();
    const { familyId, billing } = await requireFamilyOwner(uid, locale);

    const [familySnap, settings, tasks, users, dailyStats] = await Promise.all([
      familyRef(familyId).get(),
      readFamilySettings(familyId),
      readCollectionDocs(familyRef(familyId).collection("tasks")),
      readCollectionDocs(familyRef(familyId).collection("users")),
      readCollectionDocs(familyRef(familyId).collection("daily_stats")),
    ]);

    const payload = buildFamilyExport({
      familyId,
      family: familySnap.exists ? familySnap.data() : {},
      settings,
      billing,
      tasks,
      users,
      dailyStats,
    });
    return { ok: true, export: payload };
  })
);

exports.deleteFamilyAccount = onCall(
  CALLABLE_STRIPE,
  wrapCallable("deleteFamilyAccount", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    if (request.data?.confirm !== true) fail("failed-precondition", locale, "err.deleteConfirm");
    ensureApp();
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    // complimentaryForever families follow the same deletion rules.

    await cancelFamilySubscription(billing, locale);
    await deleteFamilyTree(familyId, uid, billing);

    try {
      await getAuth(ensureApp()).deleteUser(uid);
    } catch (err) {
      if (err?.code !== "auth/user-not-found") {
        console.error("deleteFamilyAccount auth delete failed", err?.message || err);
        fail("internal", locale, "err.deleteFailed");
      }
    }

    return { ok: true, deleted: true, familyId };
  })
);
