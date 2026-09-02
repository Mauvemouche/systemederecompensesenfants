"use strict";

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { ensureApp, db, serverTimestamp } = require("./lib/adminApp");
const { onCall, HttpsError, CALLABLE, wrapCallable, requireAuth, REGION } = require("./lib/callable");
const { hasAppAccess } = require("./lib/access");
const { memberRef, referralRef, readFamilyBilling } = require("./lib/families");
const { t, localeFromRequest } = require("./lib/i18n");
const { parseReferralNames, canWriteReferral } = require("./lib/referrals");
const { loadReplicaState, writeBestReferrer } = require("./lib/replicaLoad");

function fail(status, locale, key) {
  throw new HttpsError(status, t(locale, key), { key });
}

async function requireOwnerWithAccess(uid, locale) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) fail("failed-precondition", locale, "err.familyMissing");
  const billing = await readFamilyBilling(familyId);
  if (!billing?.ownerUid) fail("failed-precondition", locale, "err.familyMissing");
  if (billing.ownerUid !== uid) fail("permission-denied", locale, "err.ownerOnly");
  if (!hasAppAccess(billing)) fail("failed-precondition", locale, "err.subscriptionRequired");
  return { familyId, billing };
}

async function finishReferral(familyId, uid, parsed, locale) {
  const ref = referralRef(familyId);
  const aggRef = db().collection("referrals").doc(familyId);
  let wroteAgg = false;
  try {
    wroteAgg = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? snap.data() : null;
      if (!canWriteReferral(existing)) {
        const err = new Error("referral-once");
        err.code = "referral-once";
        throw err;
      }
      if (parsed.action === "skip") {
        tx.set(
          ref,
          {
            status: "skipped",
            updatedAt: serverTimestamp(),
            createdAt: existing?.createdAt || serverTimestamp(),
          },
          { merge: true }
        );
        return false;
      }
      tx.set(
        ref,
        {
          status: "saved",
          givenFirst: parsed.givenFirst,
          givenLast: parsed.givenLast,
          normKey: parsed.normKey,
          updatedAt: serverTimestamp(),
          createdAt: existing?.createdAt || serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(aggRef, {
        familyId,
        givenFirst: parsed.givenFirst,
        givenLast: parsed.givenLast,
        normKey: parsed.normKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    });
  } catch (err) {
    if (err?.code === "referral-once") fail("failed-precondition", locale, "err.referralOnce");
    throw err;
  }
  if (wroteAgg) await writeBestReferrer();
  return loadReplicaState(familyId, uid);
}

exports.submitReferral = onCall(
  CALLABLE,
  wrapCallable("submitReferral", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    ensureApp();
    const { familyId } = await requireOwnerWithAccess(uid, locale);
    const parsed = parseReferralNames(request.data?.first, request.data?.last);
    if (parsed.action === "invalid") fail("invalid-argument", locale, "err.referralName");
    return finishReferral(familyId, uid, parsed, locale);
  })
);

exports.skipReferral = onCall(
  CALLABLE,
  wrapCallable("skipReferral", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    ensureApp();
    const { familyId } = await requireOwnerWithAccess(uid, locale);
    return finishReferral(familyId, uid, { action: "skip" }, locale);
  })
);

exports.refreshReferralBest = onSchedule(
  {
    region: REGION,
    schedule: "10 0 * * *",
    timeZone: "Europe/Brussels",
    timeoutSeconds: 120,
  },
  async () => {
    await writeBestReferrer();
    return null;
  }
);
