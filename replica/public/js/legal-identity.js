/**
 * Public contact only. Never put a legal name or street address in this file.
 * Paid-family identity is served by getOperatorLegalIdentity after amount_paid > 0.
 */
export const PUBLIC_CONTACT_EMAIL = "kidsrewardsystem@proton.me";

export function fillPublicContact(root = document) {
  root.querySelectorAll("[data-legal-mail]").forEach((el) => {
    el.setAttribute("href", `mailto:${PUBLIC_CONTACT_EMAIL}`);
    if (!el.textContent.trim()) el.textContent = PUBLIC_CONTACT_EMAIL;
  });
}

export function hidePaidOperatorIdentity() {
  const wrap = document.getElementById("paidLegalIdentity");
  if (wrap) wrap.hidden = true;
}

export function applyPaidOperatorIdentity(identity) {
  const wrap = document.getElementById("paidLegalIdentity");
  const line = document.getElementById("paidLegalLine");
  if (!wrap) return;
  if (!identity?.revealed || !identity.legalName || !identity.streetAddress) {
    wrap.hidden = true;
    return;
  }
  const parts = [identity.legalName, identity.streetAddress, identity.postcodeCity, identity.country].filter(
    (part) => String(part || "").trim()
  );
  if (line) line.textContent = parts.join(" · ");
  wrap.hidden = parts.length < 2;
}
