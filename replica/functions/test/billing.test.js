"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  PRICE_MONTHLY,
  PRICE_YEARLY,
  TRIAL_DAYS,
  assertSandboxKey,
  buildCheckoutSessionParams,
  encodeStripeParams,
} = require("../lib/stripeCheckout");
const { verifyStripeSignature } = require("../lib/stripeHttp");
const { peopleFromChildNames, DEFAULT_FAMILY } = require("../lib/family");

describe("replica Stripe Checkout (sandbox)", () => {
  it("uses a 30-day trial, not a 0 EUR price", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "family-dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://family-dupont.web.app",
    });
    assert.equal(params.mode, "subscription");
    assert.equal(params.subscription_data.trial_period_days, 30);
    assert.equal(TRIAL_DAYS, 30);
    assert.equal(params.line_items[0].price, PRICE_MONTHLY);
    assert.equal(params.line_items[0].price, "price_1UAzwjA8Dakj1Sdel8QCE7II");
    assert.ok(!JSON.stringify(params).includes('"unit_amount":0'));
  });

  it("uses the existing yearly sandbox price", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "family-dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "yearly",
      origin: "https://example.com/",
    });
    assert.equal(params.line_items[0].price, PRICE_YEARLY);
    assert.equal(params.line_items[0].price, "price_1UAzx0A8Dakj1SdePoaupmpE");
    assert.equal(params.subscription_data.trial_period_days, 30);
  });

  it("tags the session with this replica instance id", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "family-dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
    });
    assert.equal(params.client_reference_id, "family-dupont");
    assert.equal(params.metadata.instanceId, "family-dupont");
    assert.equal(params.subscription_data.metadata.instanceId, "family-dupont");
  });

  it("rejects live Stripe secret keys", () => {
    assert.throws(() => assertSandboxKey("sk_live_example"), /sandbox|forbidden|Live/i);
    assert.doesNotThrow(() => assertSandboxKey("sk_test_example"));
  });

  it("encodes nested Checkout fields for Stripe's form API", () => {
    const body = encodeStripeParams({
      mode: "subscription",
      line_items: [{ price: PRICE_MONTHLY, quantity: 1 }],
      subscription_data: { trial_period_days: 30 },
    });
    assert.ok(body.includes("mode=subscription"));
    assert.ok(body.includes("subscription_data%5Btrial_period_days%5D=30"));
  });

  it("disables Stripe Managed Payments on Checkout Sessions", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "family-dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
    });
    assert.equal(params.managed_payments.enabled, false);
    const body = encodeStripeParams(params);
    assert.ok(body.includes("managed_payments%5Benabled%5D=false"));
    assert.equal(params.subscription_data.trial_period_days, 30);
  });

  it("verifies webhook signatures", () => {
    const payload = JSON.stringify({ id: "evt_test", livemode: false, type: "checkout.session.completed" });
    const secret = "whsec_test_secret";
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const event = verifyStripeSignature(payload, `t=${timestamp},v1=${v1}`, secret);
    assert.equal(event.livemode, false);
  });
});

describe("replica family names", () => {
  it("defaults the test instance to Kid 1 and Kid 2", () => {
    assert.deepEqual(
      DEFAULT_FAMILY.filter((p) => p.role === "child").map((p) => ({ id: p.id, name: p.name })),
      [
        { id: "kid-1", name: "Kid 1" },
        { id: "kid-2", name: "Kid 2" },
      ]
    );
    assert.equal(
      DEFAULT_FAMILY.some((p) => p.id === "florent" || p.id === "harry"),
      false
    );
  });

  it("lets a replica name its own children without Florent & Harry", () => {
    const people = peopleFromChildNames(["Léa", "Tom"]);
    assert.deepEqual(
      people.filter((p) => p.role === "child").map((p) => p.name),
      ["Léa", "Tom"]
    );
    assert.equal(
      people.some((p) => p.id === "florent" || p.id === "harry"),
      false
    );
  });
});
