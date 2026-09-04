"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
  recoverPinEmailHtml,
  recoverPinEmailText,
} = require("../lib/mailer");
const { t } = require("../lib/i18n");

const repoRoot = path.join(__dirname, "..", "..", "..");
const replicaPublic = path.join(repoRoot, "replica/public");
const uiDir = path.join(replicaPublic, "js/i18n");

function walkFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function loadUi(code) {
  return JSON.parse(fs.readFileSync(path.join(uiDir, `${code}.json`), "utf8"));
}

function replicaPublicText() {
  return walkFiles(replicaPublic)
    .filter((p) => /\.(html|js|json)$/.test(p))
    .map((p) => fs.readFileSync(p, "utf8"))
    .join("\n");
}

describe("replica client does not initialize analytics", () => {
  it("does not import Firebase Analytics, gtag, or measurementId", () => {
    const files = walkFiles(replicaPublic).filter((p) => /\.(html|js)$/.test(p));
    assert.ok(files.length > 5);
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(repoRoot, file);
      assert.equal(/firebase-analytics\.js|getAnalytics\s*\(/i.test(text), false, rel);
      assert.equal(/googletagmanager|gtag\s*\(/i.test(text), false, rel);
      assert.equal(/measurementId\s*:/i.test(text), false, rel);
      assert.equal(/cookie[- ]?banner|cookiebot|onetrust/i.test(text), false, rel);
    }
    const cfg = fs.readFileSync(path.join(replicaPublic, "js/firebase-config.js"), "utf8");
    assert.equal(/measurementId\s*:/.test(cfg), false);
    assert.equal(cfg.includes("getAnalytics"), false);
  });
});

describe("replica legal pages stay public-safe", () => {
  it("does not put a legal name or street address in git, HTML, locale JSON, or client source", () => {
    const text = replicaPublicText();
    assert.equal(text.includes("YOUR_LEGAL_NAME"), false);
    assert.equal(text.includes("YOUR_STREET_ADDRESS"), false);
    assert.equal(text.includes("YOUR_POSTCODE_CITY"), false);
    assert.equal(text.includes("OPERATOR_LEGAL_NAME"), false);
    assert.equal(text.includes("OPERATOR_STREET_ADDRESS"), false);
    assert.equal(/Rue de la Loi|Wetstraat|Avenue Louise/i.test(text), false);
    assert.match(text, /contact@kidsrewardsystem\.com/);
    assert.match(text, /kidsrewardsystem@proton\.me/);
    const identity = fs.readFileSync(path.join(replicaPublic, "js/legal-identity.js"), "utf8");
    assert.match(identity, /PUBLIC_CONTACT_EMAIL/);
    assert.match(identity, /contact@kidsrewardsystem\.com/);
    assert.equal(identity.includes("legalName:"), false);
    assert.equal(identity.includes("streetAddress:"), false);
  });

  it("shows contact email on public pages and hides paid identity until the callable reveals it", () => {
    const index = fs.readFileSync(path.join(replicaPublic, "index.html"), "utf8");
    const privacy = fs.readFileSync(path.join(replicaPublic, "privacy.html"), "utf8");
    const terms = fs.readFileSync(path.join(replicaPublic, "terms.html"), "utf8");
    assert.match(index, /id="appLegalFooter"/);
    assert.match(index, /data-i18n="footer.belgianDad"/);
    assert.match(index, /data-legal-mail/);
    assert.match(index, /id="paidLegalIdentity" hidden/);
    assert.equal(index.includes('data-legal="legalName"'), false);
    assert.equal(privacy.includes("data-legal=\"legalName\""), false);
    assert.equal(terms.includes("data-legal=\"streetAddress\""), false);
    assert.match(privacy, /data-i18n="privacy.storageTitle"/);
    assert.match(privacy, /data-i18n="privacy.storageBody"/);
    assert.ok(
      privacy.indexOf("privacy.processorsBody") < privacy.indexOf("privacy.storageTitle"),
      "storage section follows processors"
    );
    assert.ok(
      privacy.indexOf("privacy.storageBody") < privacy.indexOf("privacy.retentionTitle"),
      "storage section precedes retention"
    );
    assert.match(privacy, /data-i18n="legal.paidNote"/);
    assert.match(terms, /data-i18n="legal.paidNote"/);
    assert.match(privacy, /data-i18n="legal.contactTitle"/);
    assert.match(terms, /data-i18n="legal.contactTitle"/);
    assert.equal(privacy.includes('data-i18n="legal.belgianDad"'), false);
    assert.equal(terms.includes('data-i18n="legal.belgianDad"'), false);
    assert.match(index, /data-i18n="footer.belgianDad"/);
    assert.match(index, /href="\.\/privacy\.html"/);
    assert.match(index, /href="\.\/terms\.html"/);
    const gate = fs.readFileSync(path.join(replicaPublic, "js/family-gate.js"), "utf8");
    assert.match(gate, /getOperatorLegalIdentity/);
    assert.match(gate, /applyPaidOperatorIdentity/);
    assert.match(gate, /hidePaidOperatorIdentity/);
  });

  it("requires a Terms + Privacy checkbox before replica signup", () => {
    const html = fs.readFileSync(path.join(replicaPublic, "index.html"), "utf8");
    const form = html.match(/<form id="authForm"[\s\S]*?<\/form>/)[0];
    assert.match(form, /id="acceptLegal"/);
    assert.match(form, /id="acceptLegalWrap"/);
    assert.ok(form.indexOf("acceptLegal") < form.indexOf("gateError"));
    const gate = fs.readFileSync(path.join(replicaPublic, "js/family-gate.js"), "utf8");
    assert.match(gate, /err\.acceptedLegal/);
    assert.match(gate, /acceptedLegal: true/);
    const signup = fs.readFileSync(path.join(repoRoot, "replica/functions/signup.js"), "utf8");
    assert.match(signup, /acceptedLegal !== true/);
    assert.match(signup, /err\.acceptedLegal/);
  });

  it("requires a withdrawal checkbox on the checkout gate before Stripe redirect", () => {
    const html = fs.readFileSync(path.join(replicaPublic, "index.html"), "utf8");
    const checkout = html.match(/<section id="gate-checkout"[\s\S]*?<\/section>/)[0];
    assert.match(checkout, /id="acceptWithdrawal"/);
    assert.match(checkout, /id="acceptWithdrawalWrap"/);
    assert.match(checkout, /data-i18n="gate.acceptWithdrawal"/);
    assert.match(html, /id="cancelSubBtn"/);
    assert.match(html, /data-i18n="header.cancelSubscription"/);
    assert.ok(checkout.indexOf("acceptWithdrawal") < checkout.indexOf("checkoutMonthlyBtn"));
    const gate = fs.readFileSync(path.join(replicaPublic, "js/family-gate.js"), "utf8");
    assert.match(gate, /acceptWithdrawal/);
    assert.match(gate, /err\.acceptedWithdrawal/);
    assert.match(gate, /acceptedWithdrawal: true/);
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /acceptedWithdrawal !== true/);
    assert.match(billing, /err\.acceptedWithdrawal/);
    assert.match(billing, /legalAcceptPatch/);
    assert.equal(html.includes('data-i18n="legal.belgianDad"'), false);
  });

  it("does not add replica legal pages or the operator callable to the live public/ app", () => {
    assert.equal(fs.existsSync(path.join(repoRoot, "public/privacy.html")), false);
    assert.equal(fs.existsSync(path.join(repoRoot, "public/terms.html")), false);
    assert.equal(fs.existsSync(path.join(repoRoot, "public/js/legal-identity.js")), false);
    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("appLegalFooter"), false);
    assert.equal(liveIndex.includes("acceptLegal"), false);
    const liveFns = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(liveFns.includes("getOperatorLegalIdentity"), false);
  });
});

describe("privacy and terms copy covers the required GDPR / e-commerce points", () => {
  it("mentions stored data, processors, no sale, deletion, paid-invoice identity note, and no analytics cookies", () => {
    for (const code of ["nl", "fr", "de", "en"]) {
      const ui = loadUi(code);
      const blob = [
        ui["privacy.dataParentEmail"],
        ui["privacy.dataKidsNames"],
        ui["privacy.dataTasks"],
        ui["privacy.dataScreenTime"],
        ui["privacy.dataPinHash"],
        ui["privacy.dataStripe"],
        ui["privacy.purposeBody"],
        ui["privacy.processorsBody"],
        ui["privacy.storageBody"],
        ui["privacy.cookiesBody"],
        ui["privacy.deletionHtml"],
        ui["privacy.controllerBody"],
        ui["privacy.basesBody"],
        ui["privacy.minimiseBody"],
        ui["privacy.retentionBody"],
        ui["privacy.rightsBody"],
        ui["privacy.securityBody"],
        ui["privacy.kidsBody"],
        ui["legal.paidNote"],
        ui["terms.priceBody"],
        ui["terms.cancelBody"],
        ui["terms.withdrawBody"],
        ui["terms.productBody"],
        ui["gate.acceptLegal"],
        ui["gate.acceptWithdrawal"],
      ].join("\n");
      assert.match(blob, /Firebase/i);
      assert.match(blob, /Stripe/i);
      assert.match(blob, /Proton/i);
      assert.match(blob, /e-?mail/i);
      assert.match(blob, /voornamen|prénoms|Vornamen|first names/i);
      assert.match(blob, /taken|tâches|Aufgaben|tasks/i);
      assert.match(blob, /schermtijd|écran|Bildschirmzeit|screen time/i);
      assert.match(blob, /hash/i);
      assert.match(blob, /vend|verkopen|verkaufen|sell/i);
      assert.match(blob, /analytics/i);
      assert.match(ui["privacy.processorsBody"], /Firebase/i);
      assert.match(ui["privacy.processorsBody"], /Stripe/i);
      assert.match(ui["privacy.processorsBody"], /Proton/i);
      assert.match(ui["privacy.processorsBody"], /SCC|standard contractual|standaardcontract|clauses contractuelles|Standardvertrag/i);
      assert.match(ui["privacy.processorsBody"], /pas de SendGrid|geen SendGrid|kein SendGrid|no SendGrid/i);
      assert.match(ui["privacy.storageTitle"], /Stockage|Opslag|Speicherung|Storage/);
      assert.match(ui["privacy.storageBody"], /Firebase/i);
      assert.match(ui["privacy.storageBody"], /Stripe/i);
      assert.match(ui["privacy.storageBody"], /Proton/i);
      assert.match(
        ui["privacy.storageBody"],
        /uniquement via ces sous-traitants|uitsluitend via deze verwerkers|ausschließlich über diese Auftragsverarbeiter|only through these processors/i
      );
      assert.match(
        ui["privacy.storageBody"],
        /serveur ou un cloud qui nous serait propre|geen persoonsgegevens op een eigen server of in een eigen cloud|keine personenbezogenen Daten auf einem eigenen Server oder in einer eigenen Cloud|do not keep personal data on a server or cloud of our own/i
      );
      assert.match(
        ui["privacy.storageBody"],
        /uniquement conservées dans Firebase, Stripe et Proton|uitsluitend bewaard in Firebase, Stripe en Proton|ausschließlich in Firebase, Stripe und Proton|held only in Firebase, Stripe and Proton/i
      );
      assert.match(
        ui["privacy.storageBody"],
        /stockage séparé de notre part|aparte opslag van onze kant|gesonderte Speicherung unsererseits|separate storage on our part/i
      );
      assert.match(ui["privacy.minimiseBody"], /photo|foto|Foto/i);
      assert.match(ui["privacy.minimiseBody"], /school|école|Schule/i);
      assert.match(ui["privacy.minimiseBody"], /santé|gezondheid|Gesundheit|health/i);
      assert.match(ui["privacy.minimiseBody"], /ne collectons pas|verzamelen geen|erheben kein|do not collect/i);
      assert.match(ui["privacy.deletionHtml"], /data-legal-mail/);
      assert.match(ui["privacy.rightsBody"], /Exporter|exporteren|exportieren|Export/i);
      assert.match(ui["privacy.retentionBody"], /30/);
      assert.match(ui["privacy.retentionBody"], /ComplimentaryForever/);
      assert.match(ui["legal.paidNote"], /contact@kidsrewardsystem\.com/);
      assert.match(ui["legal.paidNote"], /kidsrewardsystem@proton\.me/);
      assert.match(ui["legal.paidNote"], /30/);
      assert.match(ui["legal.paidNote"], /entreprise|ondernemingsnummer|Unternehmensnummer/i);
      assert.equal(/promo/i.test(ui["legal.paidNote"]), false, code);
      assert.equal(/gratuit pour toujours|free forever|voor altijd gratis|für immer kostenlos/i.test(ui["terms.priceBody"]), false, code);
      assert.match(ui["terms.priceBody"], /2,50|€2\.50/);
      assert.match(ui["terms.priceBody"], /25/);
      assert.match(ui["terms.priceBody"], /30/);
      assert.match(ui["header.cancelSubscription"], /Annuler l['’]abonnement \/ se rétracter|Abonnement opzeggen \/ herroepen|Abo kündigen \/ widerrufen|Cancel subscription \/ withdraw/);
      assert.match(ui["account.cancelConfirm"], /./);
      assert.equal(ui["terms.cancelBody"].includes("contact@kidsrewardsystem.com"), false, `${code} terms.cancelBody`);
      assert.equal(ui["terms.withdrawBody"].includes("contact@kidsrewardsystem.com"), false, `${code} terms.withdrawBody`);
      assert.equal(/par e-mail|per e-mail|per E-Mail|by email/i.test(ui["terms.cancelBody"]), false, `${code} cancel email`);
      assert.equal(/par e-mail|per e-mail|per E-Mail|by email/i.test(ui["terms.withdrawBody"]), false, `${code} withdraw email`);
      assert.match(ui["terms.cancelBody"], /Annuler l['’]abonnement \/ se rétracter|Abonnement opzeggen \/ herroepen|Abo kündigen \/ widerrufen|Cancel subscription \/ withdraw/);
      assert.match(ui["terms.withdrawBody"], /Annuler l['’]abonnement \/ se rétracter|Abonnement opzeggen \/ herroepen|Abo kündigen \/ widerrufen|Cancel subscription \/ withdraw/);
      assert.match(ui["terms.cancelBody"], /fin des 30|einde van de 30|Ende der 30|end of the 30/i);
      assert.match(ui["terms.cancelBody"], /période déjà payée|al betaalde periode|bereits bezahlten|already-paid period/i);
      assert.match(ui["terms.cancelBody"], /puis s['’]arrête|dan stopt|endet dann|then stops/i);
      assert.match(ui["terms.withdrawBody"], /14/);
      assert.match(ui["terms.withdrawBody"], /30/);
      assert.match(ui["terms.withdrawBody"], /inclus|zit in|eingeschlossen|included/i);
      assert.match(ui["terms.withdrawBody"], /pas de délai|geen extra bedenktijd|keine extra Widerrufsfrist|no extra cooling-off/i);
      assert.match(ui["terms.withdrawBody"], /renouvellement|verlenging|Verlängerung|renewal/i);
      assert.match(ui["terms.withdrawBody"], /puis s['’]arrête|dan stopt|endet dann|then stops/i);
      assert.match(ui["gate.acceptWithdrawal"], /14/);
      assert.match(ui["gate.acceptWithdrawal"], /essai|proef|Test|trial/i);
      assert.match(ui["gate.acceptWithdrawal"], /Annuler l['’]abonnement \/ se rétracter|Abonnement opzeggen \/ herroepen|Abo kündigen \/ widerrufen|Cancel subscription \/ withdraw/);
      assert.match(ui["gate.checkoutCancel"], /Annuler l['’]abonnement \/ se rétracter|Abonnement opzeggen \/ herroepen|Abo kündigen \/ widerrufen|Cancel subscription \/ withdraw/);
      assert.match(ui["terms.productBody"], /belge|Belgische|belgischen|Belgian/i);
      assert.match(ui["terms.productBody"], /tâches à réaliser|taken te doen|zu erledigenden Aufgaben|tasks to do/i);
      assert.match(ui["terms.productBody"], /récompense en temps d['’]écran|beloning in schermtijd|Belohnung in Bildschirmzeit|reward in screen time/i);
      assert.equal(
        /tâches, les récompenses et le temps|taken, beloningen en schermtijd|Aufgaben, Belohnungen und Bildschirmzeit|tasks, rewards and screen time/i.test(
          ui["terms.productBody"]
        ),
        false,
        `${code} old product wording`
      );
      assert.equal(/récompense[s]? (personnalis|custom)|custom reward image|beloningsafbeelding|Belohnungsbild/i.test(ui["terms.productBody"]), false, `${code} no custom reward images`);
      assert.equal(/papa belge|Belgische papa|belgischer Papa|Belgian (dad|father)/i.test(ui["legal.contactTitle"]), false, code);
      assert.ok(ui["gate.acceptLegal"].includes("terms.html"));
      assert.ok(ui["gate.acceptLegal"].includes("privacy.html"));
    }
  });
});

describe("welcome and PIN-recovery emails include Privacy and Terms links, not a street address", () => {
  it("appends absolute privacy.html and terms.html URLs in all four locales", () => {
    for (const loc of ["nl", "fr", "de", "en"]) {
      const welcomeHtml = welcomeVerifyEmailHtml("482910", loc);
      const welcomeText = welcomeVerifyEmailText("482910", loc);
      const recoverHtml = recoverPinEmailHtml("1234", loc);
      const recoverText = recoverPinEmailText("1234", loc);
      for (const body of [welcomeHtml, welcomeText, recoverHtml, recoverText]) {
        assert.match(body, /privacy\.html/, loc);
        assert.match(body, /terms\.html/, loc);
        assert.match(body, /https:\/\/recompenses-test\.web\.app/, loc);
        assert.match(body, /contact@kidsrewardsystem\.com/, loc);
        assert.equal(body.includes("YOUR_LEGAL_NAME"), false, loc);
        assert.equal(body.includes("YOUR_STREET_ADDRESS"), false, loc);
        assert.equal(body.includes("OPERATOR_LEGAL_NAME"), false, loc);
      }
      assert.match(t(loc, "err.acceptedLegal"), /./);
    }
  });
});

describe("getOperatorLegalIdentity checks Stripe amount_paid server-side", () => {
  it("is an authenticated Stripe callable that lists paid invoices", () => {
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /exports\.getOperatorLegalIdentity/);
    assert.match(billing, /CALLABLE_OPERATOR/);
    assert.match(billing, /listCustomerInvoices/);
    assert.match(billing, /invoicesIncludePaidCharge/);
    assert.match(billing, /shouldKeepExistingMembership/);
    assert.match(billing, /amount_paid/);
    const helper = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/operatorIdentity.js"), "utf8");
    assert.match(helper, /OPERATOR_LEGAL_NAME/);
    assert.match(helper, /OPERATOR_STREET_ADDRESS/);
    assert.match(helper, /platform.*legal_identity/);
    const rules = fs.readFileSync(path.join(repoRoot, "replica/firestore.rules"), "utf8");
    assert.match(rules, /match \/platform\/\{docId\}/);
  });
});
