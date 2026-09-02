"use strict";

const { isComplimentaryForever } = require("./founderGift");

const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);

function hasAppAccess(billing) {
  if (!billing || !billing.status) return false;
  return ACCESS_STATUSES.has(billing.status);
}

function needsCheckout(billing) {
  if (!billing) return true;
  if (["trialing", "active", "past_due"].includes(billing.status) && billing.stripeSubscriptionId) {
    return false;
  }
  return true;
}

function needsKidsSetup(settings) {
  if (!settings) return true;
  if (settings.kidsNamed) return false;
  const children = (settings.people || []).filter((p) => p.role === "child");
  return children.length === 0;
}

function needsAdminPin(settings) {
  return !settings || !settings.adminPinHash;
}

function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      return "incomplete";
    default:
      return stripeStatus || "incomplete";
  }
}

function billingFromSubscription(sub, extras = {}) {
  const customer = sub.customer;
  const price = sub.items?.data?.[0]?.price;
  const complimentaryForever = isComplimentaryForever(sub, extras);
  return {
    status: mapStripeStatus(sub.status),
    stripeCustomerId: typeof customer === "string" ? customer : customer?.id || extras.customerId || null,
    stripeSubscriptionId: sub.id || extras.subscriptionId || null,
    stripePriceId: typeof price === "string" ? price : price?.id || extras.priceId || null,
    trialEnd: sub.trial_end || null,
    currentPeriodEnd: sub.current_period_end || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    ...(complimentaryForever ? { complimentaryForever: true } : {}),
  };
}

module.exports = {
  ACCESS_STATUSES,
  hasAppAccess,
  needsCheckout,
  needsKidsSetup,
  needsAdminPin,
  mapStripeStatus,
  billingFromSubscription,
};
