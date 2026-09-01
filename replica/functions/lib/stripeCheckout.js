"use strict";

const PRICE_MONTHLY = "price_1UAzwjA8Dakj1Sdel8QCE7II";
const PRICE_YEARLY = "price_1UAzx0A8Dakj1SdePoaupmpE";
const PRODUCT_ID = "prod_VBMgh23YU5Q2RB";
const TRIAL_DAYS = 30;

function assertSandboxKey(secretKey) {
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  if (String(secretKey).startsWith("sk_live")) {
    throw new Error("Live Stripe keys are forbidden. Use the AnthonyRsca sandbox (sk_test) only.");
  }
  if (!String(secretKey).startsWith("sk_test") && !String(secretKey).startsWith("rk_test")) {
    throw new Error("Stripe key must be a sandbox test key (sk_test / rk_test).");
  }
}

function resolvePriceId(plan, env = process.env) {
  if (plan === "yearly") return env.STRIPE_PRICE_YEARLY || PRICE_YEARLY;
  return env.STRIPE_PRICE_MONTHLY || PRICE_MONTHLY;
}

function buildCheckoutSessionParams({ instanceId, uid, email, plan, origin }) {
  if (!instanceId) throw new Error("instanceId required");
  if (!uid) throw new Error("uid required");
  if (!origin) throw new Error("origin required");
  const priceId = resolvePriceId(plan);
  const base = String(origin).replace(/\/$/, "");

  return {
    mode: "subscription",
    customer_email: email || undefined,
    client_reference_id: instanceId,
    payment_method_collection: "always",
    allow_promotion_codes: "true",
    locale: "fr",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        instanceId,
        firebaseUid: uid,
      },
    },
    metadata: {
      instanceId,
      firebaseUid: uid,
      plan: plan === "yearly" ? "yearly" : "monthly",
    },
    success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancel`,
  };
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
  assertSandboxKey,
  resolvePriceId,
  buildCheckoutSessionParams,
  encodeStripeParams,
};
