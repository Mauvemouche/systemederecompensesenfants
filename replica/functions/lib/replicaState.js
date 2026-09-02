"use strict";

const { hasAppAccess, needsCheckout, needsKidsSetup, needsAdminPin } = require("./access");
const { DEFAULT_FAMILY } = require("./family");

function serializeState(familyId, billing, settings, uid, extras = {}) {
  const billingData = billing && typeof billing === "object" ? { ...billing } : { status: "incomplete" };
  const settingsData = settings && typeof settings === "object" ? settings : { people: DEFAULT_FAMILY, kidsNamed: true };
  const { adminPinHash: _hash, ..._rest } = settingsData;
  void _hash;
  void _rest;

  return {
    instanceId: extras.instanceId || "replica",
    familyId: familyId || null,
    ownerUid: billingData.ownerUid || null,
    isOwner: !!(uid && billingData.ownerUid === uid),
    billing: {
      status: billingData.status || "incomplete",
      ownerUid: billingData.ownerUid || null,
      ownerEmail: billingData.ownerEmail || "",
      plan: billingData.plan || "monthly",
      stripeCustomerId: billingData.stripeCustomerId || null,
      stripeSubscriptionId: billingData.stripeSubscriptionId || null,
      stripePriceId: billingData.stripePriceId || null,
      trialEnd: billingData.trialEnd || null,
      currentPeriodEnd: billingData.currentPeriodEnd || null,
      cancelAtPeriodEnd: !!billingData.cancelAtPeriodEnd,
      complimentaryForever: !!billingData.complimentaryForever,
    },
    people: settingsData.people || DEFAULT_FAMILY,
    kidsNamed: !!settingsData.kidsNamed,
    familyName: settingsData.name || "",
    hasAccess: hasAppAccess(billingData),
    needsCheckout: needsCheckout(billingData),
    needsKids: needsKidsSetup(settingsData),
    needsAdminPin: needsAdminPin(settingsData),
    complimentaryForever: !!billingData.complimentaryForever,
  };
}

module.exports = { serializeState };
