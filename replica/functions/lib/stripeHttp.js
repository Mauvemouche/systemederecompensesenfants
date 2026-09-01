"use strict";

const crypto = require("crypto");
const { assertSandboxKey, encodeStripeParams } = require("./stripeCheckout");

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header) throw new Error("Missing Stripe-Signature header");
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");

  const pairs = String(header)
    .split(",")
    .map((part) => part.trim().split("="));
  const timestamp = pairs.find((p) => p[0] === "t")?.[1];
  const signatures = pairs.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!timestamp || signatures.length === 0) throw new Error("Malformed Stripe-Signature header");

  const payload = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const match = signatures.some((sig) => timingSafeEqualHex(sig, expected));
  if (!match) throw new Error("Invalid Stripe signature");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isFinite(Number(timestamp)) && age > toleranceSec) {
    throw new Error("Stripe signature timestamp too old");
  }

  return JSON.parse(payload);
}

async function stripeRequest(method, path, params, secretKey) {
  assertSandboxKey(secretKey);
  const base = "https://api.stripe.com/v1";
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": "2024-06-20",
  };

  let url = `${base}${path}`;
  const init = { method, headers };

  if (method === "GET") {
    const qs = encodeStripeParams(params || {});
    if (qs) url += `?${qs}`;
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = encodeStripeParams(params || {});
  }

  const res = await fetch(url, init);
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || "Stripe API error");
    err.code = json.error.code;
    err.type = json.error.type;
    err.statusCode = res.status;
    throw err;
  }
  return json;
}

module.exports = {
  timingSafeEqualHex,
  verifyStripeSignature,
  stripeRequest,
};
