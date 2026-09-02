"use strict";

function asCoupon(value) {
  if (!value || typeof value !== "object") return null;
  if (value.percent_off != null || value.amount_off != null || value.duration) return value;
  if (value.coupon) return asCoupon(value.coupon);
  if (value.source?.coupon) return asCoupon(value.source.coupon);
  return null;
}

function collectCoupons(...sources) {
  const out = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== "object") return;
    const coupon = asCoupon(value);
    if (coupon) out.push(coupon);
    if (value.discount) visit(value.discount);
    if (value.discounts) visit(value.discounts);
    const breakdown = value.total_details?.breakdown?.discounts;
    if (Array.isArray(breakdown)) {
      breakdown.forEach((row) => visit(row.discount || row));
    }
  };
  sources.forEach(visit);
  return out;
}

function invoiceAmountDue(sub, extras = {}) {
  if (extras.amountDue != null && extras.amountDue !== "") return Number(extras.amountDue);
  const invoice = extras.invoice || (sub && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null);
  if (invoice && invoice.amount_due != null) return Number(invoice.amount_due);
  if (extras.session && extras.session.amount_total != null) return Number(extras.session.amount_total);
  return null;
}

/**
 * Founder / 100% forever promo: duration forever AND (100% off OR amount due 0).
 * A trial with amount 0 but no forever coupon is not a gift.
 */
function isComplimentaryForever(sub, extras = {}) {
  const coupons = collectCoupons(sub, extras.session, extras.invoice);
  const forever = coupons.some((c) => c.duration === "forever");
  if (!forever) return false;
  if (coupons.some((c) => Number(c.percent_off) >= 100)) return true;
  const due = invoiceAmountDue(sub, extras);
  return due === 0;
}

module.exports = {
  asCoupon,
  collectCoupons,
  invoiceAmountDue,
  isComplimentaryForever,
};
