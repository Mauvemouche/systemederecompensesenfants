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
const { peopleFromChildNames, DEFAULT_FAMILY, renamePersonInList } = require("../lib/family");

describe("replica Stripe Checkout (sandbox)", () => {
  it("uses a 30-day trial, not a 0 EUR price", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://recompenses-test.web.app",
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
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "yearly",
      origin: "https://example.com/",
    });
    assert.equal(params.line_items[0].price, PRICE_YEARLY);
    assert.equal(params.line_items[0].price, "price_1UAzx0A8Dakj1SdePoaupmpE");
    assert.equal(params.subscription_data.trial_period_days, 30);
  });

  it("tags the session, subscription, and client_reference with familyId", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
    });
    assert.equal(params.client_reference_id, "fam_dupont");
    assert.equal(params.metadata.familyId, "fam_dupont");
    assert.equal(params.metadata.instanceId, "recompenses-test");
    assert.equal(params.subscription_data.metadata.familyId, "fam_dupont");
    assert.equal(params.subscription_data.metadata.firebaseUid, "uid_1");
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
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
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

  it("lets the customer type a promotion code and skips the card when the total is 0", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
    });
    assert.equal(params.allow_promotion_codes, "true");
    assert.equal(params.payment_method_collection, "if_required");
    const body = encodeStripeParams(params);
    assert.ok(body.includes("allow_promotion_codes=true"));
    assert.ok(body.includes("payment_method_collection=if_required"));
  });

  it("passes an existing Stripe customer so customer metadata can carry familyId", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
      customerId: "cus_test_1",
    });
    assert.equal(params.customer, "cus_test_1");
    assert.equal(params.customer_email, undefined);
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

  it("renames a person by id without changing id, role, or theme", () => {
    const result = renamePersonInList(DEFAULT_FAMILY, "kid-1", "  Léa  ");
    assert.equal(result.error, undefined);
    const kid = result.people.find((p) => p.id === "kid-1");
    const papa = result.people.find((p) => p.id === "papa");
    assert.equal(kid.name, "Léa");
    assert.equal(kid.role, "child");
    assert.equal(kid.theme, "child-a");
    assert.equal(papa.name, "Papa");
    assert.equal(papa.role, "parent");
    assert.deepEqual(
      result.people.map((p) => p.id),
      ["papa", "maman", "kid-1", "kid-2"]
    );
  });

  it("lets the parent rename Papa or Maman while keeping parent roles", () => {
    const papa = renamePersonInList(DEFAULT_FAMILY, "papa", "Pierre");
    assert.equal(papa.people.find((p) => p.id === "papa").name, "Pierre");
    assert.equal(papa.people.find((p) => p.id === "papa").role, "parent");
    const maman = renamePersonInList(DEFAULT_FAMILY, "maman", "Anne");
    assert.equal(maman.people.find((p) => p.id === "maman").name, "Anne");
    assert.equal(maman.people.find((p) => p.id === "maman").role, "parent");
  });

  it("refuses empty, whitespace-only, and too-long names", () => {
    assert.equal(renamePersonInList(DEFAULT_FAMILY, "kid-1", "").error, "invalid-name");
    assert.equal(renamePersonInList(DEFAULT_FAMILY, "kid-1", "   ").error, "invalid-name");
    assert.equal(renamePersonInList(DEFAULT_FAMILY, "kid-1", "x".repeat(41)).error, "invalid-name");
    assert.equal(renamePersonInList(DEFAULT_FAMILY, "kid-1", "x".repeat(40)).error, undefined);
    assert.equal(renamePersonInList(DEFAULT_FAMILY, "inconnu", "Léa").error, "not-found");
  });
});
