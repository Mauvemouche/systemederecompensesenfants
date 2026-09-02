"use strict";

const { db, ensureApp, serverTimestamp } = require("./adminApp");
const { readFamilyBilling, readFamilySettings, referralRef, readFamilyReferral } = require("./families");
const { serializeState } = require("./replicaState");
const {
  monthKeyFromDate,
  referralMonthDocId,
  pickMonthlyWinner,
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

async function listMonthReferrals(monthKey) {
  const snap = await db().collection("referrals").where("monthKey", "==", monthKey).get();
  return snap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    return {
      familyId: data.familyId || docSnap.id,
      givenFirst: data.givenFirst || "",
      givenLast: data.givenLast || "",
      normKey: data.normKey || "",
      createdAt: data.createdAt,
    };
  });
}

async function writeMonthWinner(monthKey = monthKeyFromDate()) {
  const rows = await listMonthReferrals(monthKey);
  const winner = pickMonthlyWinner(rows);
  const payload = {
    displayFirst: winner.displayFirst || "",
    displayLast: winner.displayLast || "",
    count: winner.count || 0,
    monthKey,
    updatedAt: serverTimestamp(),
  };
  await platformDoc(referralMonthDocId(monthKey)).set(payload, { merge: true });
  return publicThanksPayload(winner);
}

async function readCurrentReferralThanks(monthKey = monthKeyFromDate()) {
  const snap = await platformDoc(referralMonthDocId(monthKey)).get();
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
  listMonthReferrals,
  writeMonthWinner,
  readCurrentReferralThanks,
  loadReplicaState,
};
