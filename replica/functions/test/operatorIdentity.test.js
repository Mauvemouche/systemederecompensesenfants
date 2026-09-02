"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  PUBLIC_CONTACT_EMAIL,
  identityFromSources,
  publicContactPayload,
  invoicesIncludePaidCharge,
  canRevealOperator,
  revealPayload,
} = require("../lib/operatorIdentity");

describe("operator identity is gated on a real paid invoice", () => {
  it("does not treat trial or 100% forever $0 invoices as a paid charge", () => {
    assert.equal(invoicesIncludePaidCharge([{ status: "paid", amount_paid: 0 }]), false);
    assert.equal(invoicesIncludePaidCharge([{ status: "paid", amount_paid: "0" }]), false);
    assert.equal(invoicesIncludePaidCharge([]), false);
    assert.equal(invoicesIncludePaidCharge(null), false);
  });

  it("treats amount_paid > 0 as the first successful charge", () => {
    assert.equal(
      invoicesIncludePaidCharge([
        { status: "paid", amount_paid: 0 },
        { status: "paid", amount_paid: 250 },
      ]),
      true
    );
  });

  it("never reveals name or street without both a paid charge and configured identity", () => {
    const identity = identityFromSources({
      OPERATOR_LEGAL_NAME: "OPERATOR_LEGAL_NAME",
      OPERATOR_STREET_ADDRESS: "OPERATOR_STREET_ADDRESS",
    });
    assert.equal(identity.legalName, "");
    assert.equal(identity.streetAddress, "");
    assert.equal(canRevealOperator(identity, true), false);

    const filled = identityFromSources({
      OPERATOR_LEGAL_NAME: "Example SPRL",
      OPERATOR_STREET_ADDRESS: "Example Street 1",
    });
    assert.equal(canRevealOperator(filled, false), false);
    assert.equal(canRevealOperator(filled, true), true);
    const revealed = revealPayload(filled);
    assert.equal(revealed.revealed, true);
    assert.equal(revealed.contactEmail, PUBLIC_CONTACT_EMAIL);
    assert.equal(PUBLIC_CONTACT_EMAIL, "contact@kidsrewardsystem.com");
    assert.equal(publicContactPayload().contactEmail, "contact@kidsrewardsystem.com");
    assert.equal(publicContactPayload().revealed, false);
    assert.equal("legalName" in publicContactPayload(), false);
  });
});
