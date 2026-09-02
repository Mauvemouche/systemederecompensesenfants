"use strict";

const { db } = require("./adminApp");

const PUBLIC_CONTACT_EMAIL = "contact@kidsrewardsystem.com";
const SECONDARY_COMPLAINTS_EMAIL = "kidsrewardsystem@proton.me";

/**
 * Operator name + street are NOT in the repo.
 * Set them once in Secret Manager (OPERATOR_LEGAL_NAME / OPERATOR_STREET_ADDRESS)
 * and bind them on getOperatorLegalIdentity. They survive functions deploy.
 * Optional extra fields: OPERATOR_POSTCODE_CITY, OPERATOR_COUNTRY, OPERATOR_BCE_KBO, OPERATOR_VAT
 * (env or Firestore platform/legal_identity, Admin SDK only).
 * Never commit real values. Never put them in replica/public or locale JSON.
 */

function cleanField(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^OPERATOR_[A-Z0-9_]+$/.test(s)) return "";
  if (/^YOUR_[A-Z0-9_]+$/.test(s)) return "";
  if (/^(BCE_KBO_NUMBER|VAT_NUMBER|CONTACT_EMAIL)$/.test(s)) return "";
  return s;
}

function identityFromSources(env = {}, doc = {}) {
  return {
    legalName: cleanField(env.OPERATOR_LEGAL_NAME || doc.legalName),
    streetAddress: cleanField(env.OPERATOR_STREET_ADDRESS || doc.streetAddress),
    postcodeCity: cleanField(env.OPERATOR_POSTCODE_CITY || doc.postcodeCity),
    country: cleanField(env.OPERATOR_COUNTRY || doc.country),
    bceKbo: cleanField(env.OPERATOR_BCE_KBO || doc.bceKbo),
    vatNumber: cleanField(env.OPERATOR_VAT || doc.vatNumber),
  };
}

function publicContactPayload() {
  return {
    revealed: false,
    contactEmail: PUBLIC_CONTACT_EMAIL,
  };
}

function invoicesIncludePaidCharge(invoices) {
  return (Array.isArray(invoices) ? invoices : []).some((inv) => Number(inv?.amount_paid) > 0);
}

function canRevealOperator(identity, paidCharge) {
  return !!(paidCharge && identity?.legalName && identity?.streetAddress);
}

function revealPayload(identity) {
  return {
    revealed: true,
    contactEmail: PUBLIC_CONTACT_EMAIL,
    legalName: identity.legalName,
    streetAddress: identity.streetAddress,
    postcodeCity: identity.postcodeCity || "",
    country: identity.country || "",
    bceKbo: identity.bceKbo || "",
    vatNumber: identity.vatNumber || "",
  };
}

async function readOperatorDoc() {
  try {
    const snap = await db().collection("platform").doc("legal_identity").get();
    return snap.exists ? snap.data() || {} : {};
  } catch (_) {
    return {};
  }
}

async function loadOperatorIdentity(env = process.env) {
  const doc = await readOperatorDoc();
  return identityFromSources(env, doc);
}

async function listCustomerInvoices(stripeRequest, secret, customerId) {
  const invoices = [];
  let startingAfter = null;
  for (let page = 0; page < 5; page += 1) {
    const params = { customer: customerId, status: "paid", limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const list = await stripeRequest("GET", "/invoices", params, secret);
    const batch = Array.isArray(list?.data) ? list.data : [];
    invoices.push(...batch);
    if (!list?.has_more || !batch.length) break;
    startingAfter = batch[batch.length - 1].id;
  }
  return invoices;
}

module.exports = {
  PUBLIC_CONTACT_EMAIL,
  SECONDARY_COMPLAINTS_EMAIL,
  cleanField,
  identityFromSources,
  publicContactPayload,
  invoicesIncludePaidCharge,
  canRevealOperator,
  revealPayload,
  loadOperatorIdentity,
  listCustomerInvoices,
};
