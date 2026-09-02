"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { hasAppAccess, needsCheckout, needsKidsSetup, billingFromSubscription } = require("../lib/access");
const { peopleFromChildNames, DEFAULT_PARENTS, DEFAULT_FAMILY } = require("../lib/family");

describe("replica billing access", () => {
  it("lets trialing, active and past_due families use the board", () => {
    for (const status of ["trialing", "active", "past_due"]) {
      assert.equal(hasAppAccess({ status }), true, status);
    }
  });

  it("blocks incomplete and canceled replicas", () => {
    assert.equal(hasAppAccess({ status: "incomplete" }), false);
    assert.equal(hasAppAccess({ status: "canceled" }), false);
  });

  it("requires checkout until a subscription exists", () => {
    assert.equal(needsCheckout({ status: "incomplete" }), true);
    assert.equal(needsCheckout({ status: "trialing", stripeSubscriptionId: "sub_test" }), false);
  });

  it("requires kids setup until children are named", () => {
    assert.equal(needsKidsSetup({ people: DEFAULT_PARENTS, kidsNamed: false }), true);
    assert.equal(needsKidsSetup({ people: peopleFromChildNames(["Léa"]), kidsNamed: true }), false);
    assert.equal(needsKidsSetup({ people: DEFAULT_FAMILY, kidsNamed: true }), false);
  });

  it("maps a trialing subscription onto billing fields", () => {
    const billing = billingFromSubscription({
      id: "sub_123",
      status: "trialing",
      customer: "cus_123",
      trial_end: 1700000000,
      items: { data: [{ price: { id: "price_1UAzwjA8Dakj1Sdel8QCE7II" } }] },
    });
    assert.equal(billing.status, "trialing");
    assert.equal(billing.stripeSubscriptionId, "sub_123");
    assert.equal(!!billing.complimentaryForever, false);
  });
});
