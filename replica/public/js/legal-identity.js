/**
 * Fill these ALL-CAPS placeholders yourself before going live.
 * Never commit a real home address to the repo.
 *
 * YOUR_COUNTRY is Belgium as jurisdiction; keep the placeholder until you type it.
 * CONTACT_EMAIL defaults to kidsrewardsystem@proton.me.
 * BCE_KBO_NUMBER and VAT_NUMBER are optional.
 */
export const LEGAL_IDENTITY = {
  legalName: "YOUR_LEGAL_NAME",
  streetAddress: "YOUR_STREET_ADDRESS",
  postcodeCity: "YOUR_POSTCODE_CITY",
  country: "YOUR_COUNTRY",
  contactEmail: "kidsrewardsystem@proton.me",
  bceKbo: "BCE_KBO_NUMBER",
  vatNumber: "VAT_NUMBER",
};

export function fillLegalIdentity(root = document) {
  root.querySelectorAll("[data-legal]").forEach((el) => {
    const key = el.getAttribute("data-legal");
    if (key && LEGAL_IDENTITY[key] != null) el.textContent = LEGAL_IDENTITY[key];
  });
  root.querySelectorAll("[data-legal-mail]").forEach((el) => {
    el.setAttribute("href", `mailto:${LEGAL_IDENTITY.contactEmail}`);
    if (!el.textContent.trim()) el.textContent = LEGAL_IDENTITY.contactEmail;
  });
}
