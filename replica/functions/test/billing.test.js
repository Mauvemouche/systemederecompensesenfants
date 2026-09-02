"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  PRICE_MONTHLY,
  PRICE_YEARLY,
  TRIAL_DAYS,
  assertSandboxKey,
  assertStripeLivemode,
  checkoutSessionIdOk,
  isLiveStripeProject,
  resolveGcpProjectId,
  resolvePriceId,
  buildCheckoutSessionParams,
  encodeStripeParams,
  resolveCheckoutTrial,
  stripeCustomerHadTrialOrSubscription,
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
    assert.equal(params.payment_method_collection, "always");
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

  it("rejects live Stripe secret keys unless the Cloud project is kidsrewardsystem", () => {
    const testEnv = { GCLOUD_PROJECT: "recompenses-test" };
    const missingEnv = {};
    const liveEnv = { GCLOUD_PROJECT: "kidsrewardsystem" };
    const liveFromFirebaseConfig = { FIREBASE_CONFIG: JSON.stringify({ projectId: "kidsrewardsystem" }) };

    assert.equal(resolveGcpProjectId(testEnv), "recompenses-test");
    assert.equal(isLiveStripeProject(testEnv), false);
    assert.equal(isLiveStripeProject(missingEnv), false);
    assert.equal(isLiveStripeProject(liveEnv), true);
    assert.equal(isLiveStripeProject(liveFromFirebaseConfig), true);

    assert.throws(() => assertSandboxKey("sk_live_example", testEnv), /sandbox|forbidden|Live/i);
    assert.throws(() => assertSandboxKey("rk_live_example", testEnv), /sandbox|forbidden|Live/i);
    assert.throws(() => assertSandboxKey("sk_live_example", missingEnv), /sandbox|forbidden|Live/i);
    assert.throws(() => assertSandboxKey("sk_live_example"), /sandbox|forbidden|Live/i);
    assert.doesNotThrow(() => assertSandboxKey("sk_test_example", testEnv));
    assert.doesNotThrow(() => assertSandboxKey("sk_test_example"));

    assert.doesNotThrow(() => assertSandboxKey("sk_live_example", liveEnv));
    assert.doesNotThrow(() => assertSandboxKey("rk_live_example", liveEnv));
    assert.doesNotThrow(() => assertSandboxKey("sk_live_example", liveFromFirebaseConfig));
    assert.throws(() => assertSandboxKey("sk_test_example", liveEnv), /kidsrewardsystem|sk_test/i);

    assert.throws(() => assertStripeLivemode(true, testEnv), /Live mode forbidden/);
    assert.doesNotThrow(() => assertStripeLivemode(false, testEnv));
    assert.doesNotThrow(() => assertStripeLivemode(true, liveEnv));
    assert.throws(() => assertStripeLivemode(false, liveEnv), /kidsrewardsystem|Test-mode/i);

    assert.equal(checkoutSessionIdOk("cs_test_abc", testEnv), true);
    assert.equal(checkoutSessionIdOk("cs_live_abc", testEnv), false);
    assert.equal(checkoutSessionIdOk("cs_live_abc", liveEnv), true);
    assert.equal(checkoutSessionIdOk("cs_test_abc", liveEnv), false);

    assert.equal(resolvePriceId("monthly", {}), PRICE_MONTHLY);
    assert.equal(resolvePriceId("yearly", { STRIPE_PRICE_YEARLY: "price_from_secret" }), "price_from_secret");
    assert.equal(resolvePriceId("monthly", { STRIPE_PRICE_MONTHLY: "price_from_secret" }), "price_from_secret");
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

  it("lets the customer type a promotion code and still collects a payment method", () => {
    const params = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
    });
    assert.equal(params.allow_promotion_codes, "true");
    assert.equal(params.payment_method_collection, "always");
    const body = encodeStripeParams(params);
    assert.ok(body.includes("allow_promotion_codes=true"));
    assert.ok(body.includes("payment_method_collection=always"));
  });

  it("omits the trial on a second checkout for the same family", () => {
    assert.equal(resolveCheckoutTrial({ trialUsed: false, stripeSubscriptions: [] }), true);
    assert.equal(resolveCheckoutTrial({ trialUsed: true, stripeSubscriptions: [] }), false);
    assert.equal(
      resolveCheckoutTrial({
        trialUsed: false,
        stripeSubscriptions: [{ id: "sub_old", status: "canceled", trial_end: 1700000000 }],
      }),
      false
    );
    assert.equal(stripeCustomerHadTrialOrSubscription({ data: [] }), false);
    assert.equal(stripeCustomerHadTrialOrSubscription({ data: [{ id: "sub_1", status: "trialing" }] }), true);

    const first = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
      offerTrial: true,
    });
    assert.equal(first.subscription_data.trial_period_days, 30);

    const second = buildCheckoutSessionParams({
      instanceId: "recompenses-test",
      familyId: "fam_dupont",
      uid: "uid_1",
      email: "parent@example.com",
      plan: "monthly",
      origin: "https://example.com",
      customerId: "cus_test_1",
      offerTrial: false,
    });
    assert.equal(second.subscription_data.trial_period_days, undefined);
    assert.equal("trial_period_days" in second.subscription_data, false);
    assert.equal(second.customer, "cus_test_1");
    assert.equal(second.subscription_data.metadata.familyId, "fam_dupont");
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

  it("locks the trial after first checkout and still offers it to a new family", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "billing.js"), "utf8");
    assert.match(src, /resolveCheckoutTrial/);
    assert.match(src, /status: "all"/);
    assert.match(src, /offerTrial/);
    assert.match(src, /if \(next\.stripeSubscriptionId\) next\.trialUsed = true/);
    assert.equal(src.includes("fingerprint"), false);
    assert.match(src, /isLiveStripeProject/);
    assert.match(src, /assertStripeLivemode/);
    assert.match(src, /checkoutSessionIdOk/);
    const checkoutFn = src.split("exports.createCheckoutSession")[1].split("exports.confirmCheckoutSession")[0];
    assert.match(checkoutFn, /offerTrial/);
    assert.match(checkoutFn, /trialUsed/);
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
