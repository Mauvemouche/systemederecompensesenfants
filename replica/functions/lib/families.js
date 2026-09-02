"use strict";

const { getAuth } = require("firebase-admin/auth");
const { db, ensureApp, serverTimestamp } = require("./adminApp");
const { DEFAULT_FAMILY } = require("./family");
const { normalizeLocale } = require("./i18n");

const LEGACY_OWNER_EMAIL = "anthony.rsca@gmail.com";

function familyRef(familyId) {
  return db().collection("families").doc(familyId);
}

function billingRef(familyId) {
  return familyRef(familyId).collection("billing").doc("current");
}

function settingsRef(familyId) {
  return familyRef(familyId).collection("settings").doc("current");
}

function referralRef(familyId) {
  return familyRef(familyId).collection("referral").doc("current");
}

function tasksCol(familyId) {
  return familyRef(familyId).collection("tasks");
}

function usersCol(familyId) {
  return familyRef(familyId).collection("users");
}

function memberRef(uid) {
  return db().collection("family_members").doc(uid);
}

function stripeCustomerIndexRef(customerId) {
  return db().collection("stripe_customers").doc(customerId);
}

function legacyBillingRef() {
  return db().collection("billing").doc("current");
}

function familyDocPath(familyId) {
  return `families/${familyId}`;
}

function familyTasksPath(familyId) {
  return `families/${familyId}/tasks`;
}

function isLegacyOwner(legacyBilling, uid, email) {
  if (!legacyBilling || typeof legacyBilling !== "object") return false;
  if (legacyBilling.ownerUid && uid && legacyBilling.ownerUid === uid) return true;
  const ownerEmail = String(legacyBilling.ownerEmail || "").trim().toLowerCase();
  const userEmail = String(email || "").trim().toLowerCase();
  if (ownerEmail && userEmail && ownerEmail === userEmail) return true;
  if (userEmail === LEGACY_OWNER_EMAIL && (!legacyBilling.ownerUid || legacyBilling.ownerUid === uid)) {
    return true;
  }
  return false;
}

function shouldMigrateLegacy(legacyBilling, uid, email) {
  if (!legacyBilling) return false;
  if (legacyBilling.migratedToFamilyId) return false;
  return isLegacyOwner(legacyBilling, uid, email);
}

function shouldKeepExistingMembership(billing, uid) {
  return !!(uid && billing && billing.ownerUid === uid);
}

function keepMigratedLegacyFamily(legacyBilling, uid, email) {
  if (!legacyBilling?.migratedToFamilyId) return null;
  if (!isLegacyOwner(legacyBilling, uid, email)) return null;
  return String(legacyBilling.migratedToFamilyId);
}

/**
 * A new signup is always a new family. Never join someone else's.
 * Stolen family_members/{uid} docs (ownerUid !== uid) are ignored.
 */
function chooseFamilyResolution({ uid, email, memberFamilyId, memberFamilyBilling, legacyBilling }) {
  if (memberFamilyId && shouldKeepExistingMembership(memberFamilyBilling, uid)) {
    return { action: "keep-membership", familyId: memberFamilyId };
  }
  const migratedId = keepMigratedLegacyFamily(legacyBilling, uid, email);
  if (migratedId) {
    return { action: "attach-legacy", familyId: migratedId };
  }
  if (shouldMigrateLegacy(legacyBilling, uid, email)) {
    return { action: "migrate-legacy" };
  }
  return { action: "create-family" };
}

function familyIdFromStripe(...objects) {
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    const meta = obj.metadata || {};
    if (meta.familyId) return String(meta.familyId);
    if (obj.client_reference_id) return String(obj.client_reference_id);
  }
  return null;
}

function emptyBilling(uid, email, plan, now) {
  return {
    status: "incomplete",
    ownerUid: uid,
    ownerEmail: email || "",
    plan: plan === "yearly" ? "yearly" : "monthly",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function emptySettings(now, locale) {
  return {
    name: "",
    people: DEFAULT_FAMILY,
    kidsNamed: true,
    locale: normalizeLocale(locale),
    createdAt: now,
    updatedAt: now,
  };
}

async function setFamilyClaim(uid, familyId) {
  const auth = getAuth(ensureApp());
  const user = await auth.getUser(uid);
  const current = user.customClaims || {};
  if (current.familyId === familyId) return false;
  await auth.setCustomUserClaims(uid, { familyId });
  return true;
}

async function readFamilyBilling(familyId) {
  const snap = await billingRef(familyId).get();
  return snap.exists ? snap.data() : null;
}

async function readFamilySettings(familyId) {
  const snap = await settingsRef(familyId).get();
  return snap.exists ? snap.data() : null;
}

async function readFamilyReferral(familyId) {
  const snap = await referralRef(familyId).get();
  return snap.exists ? snap.data() : null;
}

async function backfillLegacyCollections(familyId) {
  const fam = await familyRef(familyId).get();
  if (!fam.exists || !fam.data().migratedFromLegacy) return 0;

  const firestore = db();
  const destTasks = await tasksCol(familyId).limit(1).get();
  const srcTasks = await firestore.collection("tasks").limit(1).get();
  let tasksCopied = 0;
  if (destTasks.empty && !srcTasks.empty) {
    tasksCopied = await copyCollectionDocs(firestore.collection("tasks"), tasksCol(familyId));
  }

  const destSettings = await settingsRef(familyId).get();
  if (!destSettings.exists) {
    const srcSettings = await firestore.collection("family_config").doc("settings").get();
    const now = serverTimestamp();
    await settingsRef(familyId).set(
      srcSettings.exists ? { ...srcSettings.data(), updatedAt: now } : emptySettings(now),
      { merge: true }
    );
  }

  await copyCollectionDocs(firestore.collection("users"), usersCol(familyId));
  await copyCollectionDocs(firestore.collection("daily_stats"), familyRef(familyId).collection("daily_stats"));
  await copyCollectionDocs(firestore.collection("cron_runs"), familyRef(familyId).collection("cron_runs"));
  await copyCollectionDocs(firestore.collection("reset_config"), familyRef(familyId).collection("reset_config"));
  return tasksCopied;
}

async function copyCollectionDocs(sourceCol, destCol) {
  const snap = await sourceCol.get();
  const docs = snap.docs;
  const size = 400;
  for (let i = 0; i < docs.length; i += size) {
    const batch = db().batch();
    docs.slice(i, i + size).forEach((docSnap) => {
      batch.set(destCol.doc(docSnap.id), docSnap.data());
    });
    await batch.commit();
  }
  return docs.length;
}

async function createFamilyForOwner(uid, email, plan, locale) {
  const firestore = db();
  const now = serverTimestamp();
  const memberDoc = memberRef(uid);
  let familyId = null;

  await firestore.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberDoc);
    if (memberSnap.exists && memberSnap.data().familyId) {
      const existingId = memberSnap.data().familyId;
      const billingSnap = await tx.get(billingRef(existingId));
      const billing = billingSnap.exists ? billingSnap.data() : null;
      if (shouldKeepExistingMembership(billing, uid)) {
        familyId = existingId;
        return;
      }
    }
    familyId = firestore.collection("families").doc().id;
    const loc = normalizeLocale(locale);
    tx.set(familyRef(familyId), {
      ownerUid: uid,
      ownerEmail: email || "",
      locale: loc,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(billingRef(familyId), emptyBilling(uid, email, plan, now));
    tx.set(settingsRef(familyId), emptySettings(now, loc));
    tx.set(usersCol(familyId).doc(uid), { email: email || "", role: "parent", updatedAt: now });
    tx.set(memberDoc, { familyId, role: "owner", createdAt: now });
  });

  return familyId;
}

async function migrateLegacySingleton(uid, email) {
  const firestore = db();
  const now = serverTimestamp();
  let familyId = null;
  let alreadyMigrated = false;
  let denyBecauseNotOwner = false;

  await firestore.runTransaction(async (tx) => {
    const legacySnap = await tx.get(legacyBillingRef());
    if (!legacySnap.exists) return;
    const legacy = legacySnap.data() || {};
    if (legacy.migratedToFamilyId) {
      if (!isLegacyOwner(legacy, uid, email)) {
        denyBecauseNotOwner = true;
        return;
      }
      familyId = legacy.migratedToFamilyId;
      alreadyMigrated = true;
      return;
    }
    if (!isLegacyOwner(legacy, uid, email)) return;

    familyId = firestore.collection("families").doc().id;
    tx.set(familyRef(familyId), {
      ownerUid: uid,
      ownerEmail: email || legacy.ownerEmail || "",
      migratedFromLegacy: true,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(billingRef(familyId), {
      ...legacy,
      ownerUid: uid,
      ownerEmail: email || legacy.ownerEmail || "",
      updatedAt: now,
    });
    tx.set(
      legacyBillingRef(),
      { migratedToFamilyId: familyId, migratedAt: now },
      { merge: true }
    );
  });

  if (denyBecauseNotOwner) return null;
  if (!familyId) return null;
  const tasksCopied = await backfillLegacyCollections(familyId);
  await memberRef(uid).set({ familyId, role: "owner", migratedFromLegacy: true, createdAt: now }, { merge: true });
  await usersCol(familyId).doc(uid).set({ email: email || "", role: "parent", updatedAt: now }, { merge: true });

  const billing = await readFamilyBilling(familyId);
  if (billing?.stripeCustomerId) {
    await stripeCustomerIndexRef(billing.stripeCustomerId).set({ familyId, uid }, { merge: true });
  }

  return { familyId, alreadyMigrated, tasksCopied };
}

async function resolveFamilyForUser(uid, email, plan, locale) {
  const memberSnap = await memberRef(uid).get();
  const memberFamilyId = memberSnap.exists ? memberSnap.data().familyId : null;
  const memberFamilyBilling = memberFamilyId ? await readFamilyBilling(memberFamilyId) : null;

  const legacySnap = await legacyBillingRef().get();
  const legacy = legacySnap.exists ? legacySnap.data() : null;

  const choice = chooseFamilyResolution({
    uid,
    email,
    memberFamilyId,
    memberFamilyBilling,
    legacyBilling: legacy,
  });

  if (choice.action === "keep-membership") {
    await backfillLegacyCollections(choice.familyId);
    return { familyId: choice.familyId, created: false, migrated: !!memberSnap.data()?.migratedFromLegacy };
  }

  if (choice.action === "attach-legacy") {
    await backfillLegacyCollections(choice.familyId);
    await memberRef(uid).set({ familyId: choice.familyId, role: "owner" }, { merge: true });
    return { familyId: choice.familyId, created: false, migrated: true };
  }

  if (choice.action === "migrate-legacy") {
    const migrated = await migrateLegacySingleton(uid, email);
    if (migrated?.familyId) {
      return { familyId: migrated.familyId, created: false, migrated: true, tasksCopied: migrated.tasksCopied };
    }
  }

  const familyId = await createFamilyForOwner(uid, email, plan, locale);
  return { familyId, created: true, migrated: false };
}

async function listFamilyIds() {
  const snap = await db().collection("families").get();
  return snap.docs.map((d) => d.id);
}

module.exports = {
  LEGACY_OWNER_EMAIL,
  familyRef,
  billingRef,
  settingsRef,
  referralRef,
  tasksCol,
  usersCol,
  memberRef,
  stripeCustomerIndexRef,
  legacyBillingRef,
  familyDocPath,
  familyTasksPath,
  isLegacyOwner,
  shouldMigrateLegacy,
  shouldKeepExistingMembership,
  keepMigratedLegacyFamily,
  chooseFamilyResolution,
  familyIdFromStripe,
  emptyBilling,
  emptySettings,
  setFamilyClaim,
  readFamilyBilling,
  readFamilySettings,
  readFamilyReferral,
  backfillLegacyCollections,
  copyCollectionDocs,
  createFamilyForOwner,
  migrateLegacySingleton,
  resolveFamilyForUser,
  listFamilyIds,
};
