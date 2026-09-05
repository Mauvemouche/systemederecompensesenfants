"use strict";

const PRICE_MONTHLY = "price_1UAzwjA8Dakj1Sdel8QCE7II";
const PRICE_YEARLY = "price_1UAzx0A8Dakj1SdePoaupmpE";
const PRODUCT_ID = "prod_VBMgh23YU5Q2RB";
const TRIAL_DAYS = 30;
const LIVE_STRIPE_PROJECT = "kidsrewardsystem";

function resolveGcpProjectId(env = process.env) {
  const direct =
    String(env.GCLOUD_PROJECT || "").trim() ||
    String(env.GCP_PROJECT || "").trim() ||
    String(env.GOOGLE_CLOUD_PROJECT || "").trim();
  if (direct) return direct;
  const raw = String(env.FIREBASE_CONFIG || "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.projectId || "").trim();
  } catch {
    return "";
  }
}

function isLiveStripeProject(env = process.env) {
  return resolveGcpProjectId(env) === LIVE_STRIPE_PROJECT;
}

function assertSandboxKey(secretKey, env = process.env) {
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  const key = String(secretKey);
  if (isLiveStripeProject(env)) {
    if (key.startsWith("sk_live") || key.startsWith("rk_live")) return;
    if (key.startsWith("sk_test") || key.startsWith("rk_test")) {
      throw new Error("Sandbox Stripe keys are forbidden on kidsrewardsystem. Never copy sk_test onto the live project.");
    }
    throw new Error("Stripe key must be a live key (sk_live / rk_live) on kidsrewardsystem.");
  }
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) {
    throw new Error("Live Stripe keys are forbidden. Use the AnthonyRsca sandbox (sk_test) only.");
  }
  if (!key.startsWith("sk_test") && !key.startsWith("rk_test")) {
    throw new Error("Stripe key must be a sandbox test key (sk_test / rk_test).");
  }
}

function assertStripeLivemode(livemode, env = process.env) {
  const live = isLiveStripeProject(env);
  if (live && !livemode) {
    throw new Error("Test-mode Stripe events are forbidden on kidsrewardsystem.");
  }
  if (!live && livemode) {
    throw new Error("Live mode forbidden");
  }
}

function checkoutSessionIdOk(sessionId, env = process.env) {
  const id = String(sessionId || "");
  if (isLiveStripeProject(env)) return id.startsWith("cs_live_");
  return id.startsWith("cs_test_");
}

function resolveCheckoutPlan(requestedPlan, storedPlan) {
  if (requestedPlan === "yearly" || requestedPlan === "monthly") return requestedPlan;
  return storedPlan || "monthly";
}

function resolvePriceId(plan, env = process.env) {
  if (plan === "yearly") return env.STRIPE_PRICE_YEARLY || PRICE_YEARLY;
  return env.STRIPE_PRICE_MONTHLY || PRICE_MONTHLY;
}

function stripeCustomerHadTrialOrSubscription(listOrResponse) {
  const list = Array.isArray(listOrResponse) ? listOrResponse : listOrResponse?.data;
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.some((sub) => {
    if (!sub || typeof sub !== "object") return false;
    return !!(sub.id || sub.trial_start || sub.trial_end || sub.status === "trialing");
  });
}

function resolveCheckoutTrial({ trialUsed, stripeSubscriptions } = {}) {
  if (trialUsed === true) return false;
  if (stripeCustomerHadTrialOrSubscription(stripeSubscriptions)) return false;
  return true;
}

function buildCheckoutSessionParams({ instanceId, familyId, uid, email, plan, origin, customerId, locale, offerTrial = true }) {
  if (!instanceId) throw new Error("instanceId required");
  if (!familyId) throw new Error("familyId required");
  if (!uid) throw new Error("uid required");
  if (!origin) throw new Error("origin required");
  const priceId = resolvePriceId(plan);
  const base = String(origin).replace(/\/$/, "");
  const familyMeta = {
    familyId,
    instanceId,
    firebaseUid: uid,
  };

  const subscription_data = {
    metadata: familyMeta,
  };
  if (offerTrial !== false) {
    subscription_data.trial_period_days = TRIAL_DAYS;
  }

  const params = {
    mode: "subscription",
    client_reference_id: familyId,
    payment_method_collection: "always",
    allow_promotion_codes: "true",
    locale: locale === "fr" || locale === "de" || locale === "en" ? locale : "nl",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data,
    metadata: {
      ...familyMeta,
      plan: plan === "yearly" ? "yearly" : "monthly",
    },
    success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancel`,
    managed_payments: { enabled: false },
  };

  if (customerId) {
    params.customer = customerId;
  } else if (email) {
    params.customer_email = email;
  }

  return params;
}

function encodeStripeParams(params) {
  const parts = [];
  const walk = (value, prefix) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${prefix}[${i}]`));
      return;
    }
    if (typeof value === "object") {
      Object.keys(value).forEach((key) => {
        walk(value[key], prefix ? `${prefix}[${key}]` : key);
      });
      return;
    }
    parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };
  walk(params, "");
  return parts.join("&");
}

module.exports = {
  PRICE_MONTHLY,
  PRICE_YEARLY,
  PRODUCT_ID,
  TRIAL_DAYS,
  LIVE_STRIPE_PROJECT,
  resolveGcpProjectId,
  isLiveStripeProject,
  assertSandboxKey,
  assertStripeLivemode,
  checkoutSessionIdOk,
  resolvePriceId,
  resolveCheckoutPlan,
  buildCheckoutSessionParams,
  encodeStripeParams,
  stripeCustomerHadTrialOrSubscription,
  resolveCheckoutTrial,
};
