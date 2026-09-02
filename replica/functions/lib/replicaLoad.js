"use strict";

const { db, ensureApp, serverTimestamp } = require("./adminApp");
const { readFamilyBilling, readFamilySettings, referralRef, readFamilyReferral } = require("./families");
const { serializeState } = require("./replicaState");
const {
  REFERRAL_BEST_DOC_ID,
  pickBestReferrer,
  publicThanksPayload,
} = require("./referrals");

function instanceId() {
  return process.env.GCLOUD_PROJECT || ensureApp().options.projectId || "replica";
}

function platformDoc(id) {
  return db().collection("platform").doc(id);
}

async function markReferralPromptPending(familyId) {
  if (!familyId) return false;
  const ref = referralRef(familyId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  });
}

async function listSavedReferrals() {
  const snap = await db().collection("referrals").get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      givenFirst: data.givenFirst || "",
      givenLast: data.givenLast || "",
      normKey: data.normKey || "",
      createdAt: data.createdAt,
    };
  });
}

async function writeBestReferrer() {
  const rows = await listSavedReferrals();
  const winner = pickBestReferrer(rows);
  const payload = {
    displayFirst: winner.displayFirst || "",
    displayLast: winner.displayLast || "",
    count: winner.count || 0,
  };
  await platformDoc(REFERRAL_BEST_DOC_ID).set(payload);
  return publicThanksPayload(winner);
}

async function readCurrentReferralThanks() {
  const snap = await platformDoc(REFERRAL_BEST_DOC_ID).get();
  if (!snap.exists) return null;
  return publicThanksPayload(snap.data());
}

async function loadReplicaState(familyId, uid) {
  const [billing, settings, referral, referralThanks] = await Promise.all([
    readFamilyBilling(familyId),
    readFamilySettings(familyId),
    readFamilyReferral(familyId),
    readCurrentReferralThanks(),
  ]);
  return serializeState(familyId, billing, settings, uid, {
    instanceId: instanceId(),
    referral,
    referralThanks,
  });
}

module.exports = {
  instanceId,
  markReferralPromptPending,
  listSavedReferrals,
  writeBestReferrer,
  readCurrentReferralThanks,
  loadReplicaState,
};
