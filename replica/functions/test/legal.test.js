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

describe("replica legal placeholders and pages", () => {
  it("keeps ALL-CAPS identity placeholders and does not invent a home address", () => {
    const identity = fs.readFileSync(path.join(replicaPublic, "js/legal-identity.js"), "utf8");
    for (const token of [
      "YOUR_LEGAL_NAME",
      "YOUR_STREET_ADDRESS",
      "YOUR_POSTCODE_CITY",
      "YOUR_COUNTRY",
      "BCE_KBO_NUMBER",
      "VAT_NUMBER",
    ]) {
      assert.match(identity, new RegExp(token));
    }
    assert.match(identity, /kidsrewardsystem@proton\.me/);
    assert.equal(/Rue |Straat |laan \d|1000 Bruxelles|1050 Ixelles/i.test(identity), false);
    const replicaText = walkFiles(replicaPublic)
      .filter((p) => /\.(html|js|json)$/.test(p))
      .map((p) => fs.readFileSync(p, "utf8"))
      .join("\n");
    assert.equal(/Rue de la Loi|Wetstraat|Avenue Louise/i.test(replicaText), false);
  });

  it("adds Privacy and Terms pages plus a footer on the main replica UI", () => {
    const index = fs.readFileSync(path.join(replicaPublic, "index.html"), "utf8");
    const privacy = fs.readFileSync(path.join(replicaPublic, "privacy.html"), "utf8");
    const terms = fs.readFileSync(path.join(replicaPublic, "terms.html"), "utf8");
    assert.match(index, /id="appLegalFooter"/);
    assert.match(index, /href="\.\/privacy\.html"/);
    assert.match(index, /href="\.\/terms\.html"/);
    assert.match(index, /data-legal="legalName"/);
    assert.match(privacy, /data-i18n="privacy.title"/);
    assert.match(privacy, /data-i18n-html="privacy.deletionHtml"/);
    assert.match(terms, /data-i18n="terms.title"/);
    assert.match(terms, /data-i18n="terms.withdrawTitle"/);
    assert.match(privacy, /legal-page\.js/);
    assert.match(terms, /legal-page\.js/);
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

  it("does not add replica legal pages or analytics-free footer to the live public/ app", () => {
    assert.equal(fs.existsSync(path.join(repoRoot, "public/privacy.html")), false);
    assert.equal(fs.existsSync(path.join(repoRoot, "public/terms.html")), false);
    assert.equal(fs.existsSync(path.join(repoRoot, "public/js/legal-identity.js")), false);
    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("appLegalFooter"), false);
    assert.equal(liveIndex.includes("acceptLegal"), false);
  });
});

describe("privacy and terms copy covers the required GDPR / e-commerce points", () => {
  it("mentions stored data, processors, no sale, deletion, and no analytics cookies in all UI locales", () => {
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
        ui["privacy.cookiesBody"],
        ui["privacy.deletionHtml"],
        ui["terms.priceBody"],
        ui["terms.cancelBody"],
        ui["terms.withdrawBody"],
        ui["terms.productBody"],
        ui["gate.acceptLegal"],
      ].join("\n");
      assert.match(blob, /Firebase/i);
      assert.match(blob, /Stripe/i);
      assert.match(blob, /e-?mail/i);
      assert.match(blob, /voornamen|prénoms|Vornamen|first names/i);
      assert.match(blob, /taken|tâches|Aufgaben|tasks/i);
      assert.match(blob, /schermtijd|écran|Bildschirmzeit|screen time/i);
      assert.match(blob, /hash/i);
      assert.match(blob, /vend|verkopen|verkaufen|sell/i);
      assert.match(blob, /analytics/i);
      assert.match(ui["privacy.deletionHtml"], /data-legal-mail/);
      assert.match(ui["terms.priceBody"], /2,50|€2\.50/);
      assert.match(ui["terms.priceBody"], /25/);
      assert.match(ui["terms.priceBody"], /30/);
      assert.match(ui["terms.cancelBody"], /Stripe/);
      assert.match(ui["terms.withdrawBody"], /14/);
      assert.match(ui["terms.productBody"], /belge|Belgische|belgischen|Belgian/i);
      assert.ok(ui["gate.acceptLegal"].includes("terms.html"));
      assert.ok(ui["gate.acceptLegal"].includes("privacy.html"));
    }
  });
});

describe("welcome and PIN-recovery emails include Privacy and Terms links", () => {
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
      }
      assert.match(t(loc, "err.acceptedLegal"), /./);
    }
  });
});
