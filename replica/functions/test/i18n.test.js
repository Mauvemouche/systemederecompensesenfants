"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { normalizeLocale, t } = require("../lib/i18n");
const {
  welcomeVerifyEmailHtml,
  welcomeVerifyEmailText,
  recoverPinEmailHtml,
  recoverPinEmailText,
} = require("../lib/mailer");

const repoRoot = path.join(__dirname, "..", "..", "..");
const uiDir = path.join(repoRoot, "replica/public/js/i18n");

function loadUi(code) {
  return JSON.parse(fs.readFileSync(path.join(uiDir, `${code}.json`), "utf8"));
}

describe("locale fallback", () => {
  it("normalizes unknown and mixed-case locales to supported codes, default nl", () => {
    assert.equal(normalizeLocale("xx"), "nl");
    assert.equal(normalizeLocale(""), "nl");
    assert.equal(normalizeLocale(null), "nl");
    assert.equal(normalizeLocale("DE"), "de");
    assert.equal(normalizeLocale("nl-BE"), "nl");
    assert.equal(normalizeLocale("en_GB"), "en");
    assert.equal(normalizeLocale("FR"), "fr");
    assert.equal(t("zz", "err.unauthenticated"), t("nl", "err.unauthenticated"));
  });
});

describe("recovery and welcome emails follow the requested locale", () => {
  it("sends Admin PIN recovery copy in the requested language, not always French", () => {
    const en = recoverPinEmailText("1234", "en");
    const nl = recoverPinEmailText("1234", "nl");
    const de = recoverPinEmailText("1234", "de");
    const fr = recoverPinEmailText("1234", "fr");
    assert.match(en, /1234/);
    assert.match(en, /Admin code/);
    assert.equal(/Nouveau code Admin/.test(en), false);
    assert.match(nl, /Admin-code/);
    assert.match(de, /Admin-Code/);
    assert.match(fr, /Nouveau code Admin/);
    assert.match(recoverPinEmailHtml("1234", "en"), /lang="en"/);
    assert.match(recoverPinEmailHtml("9999", "nl"), /lang="nl"/);
    assert.match(recoverPinEmailHtml("1234", "fr"), /À très vite !/);
    const defaultRecover = recoverPinEmailHtml("1234");
    assert.match(defaultRecover, /lang="nl"/);
    const defaultWelcome = welcomeVerifyEmailHtml("482910");
    assert.match(defaultWelcome, /lang="nl"/);
    assert.match(defaultWelcome, /Welkom/);
  });

  it("includes beer/coffee pricing and contact@kidsrewardsystem.com in all four welcome emails", () => {
    for (const loc of ["nl", "fr", "de", "en"]) {
      const html = welcomeVerifyEmailHtml("482910", loc);
      const text = welcomeVerifyEmailText("482910", loc);
      for (const body of [html, text]) {
        assert.match(body, /482910/, loc);
        assert.match(body, /2,50|€2\.50/);
        assert.match(body, /25/);
        assert.match(body, /bière|pintje|Bier|beer/i);
        assert.match(body, /café|koffie|Kaffee|coffee/i);
        assert.match(body, /contact@kidsrewardsystem\.com/);
        assert.match(body, /kidsrewardsystem@proton\.me/);
        assert.match(body, /daily summary|samenvatting|résumé quotidien|tägliche Zusammenfassung/i);
        assert.match(body, /card on file|carte enregistrée|geregistreerde kaart|hinterlegter Karte/i);
        assert.match(body, /Ce code expire après 15 minutes|Deze code vervalt na 15 minuten|Dieser Code läuft nach 15 Minuten ab|This code expires after 15 minutes/);
        assert.match(body, /récompense et responsabilités|beloning en verantwoordelijkheden|Belohnung und Verantwortung|rewards and responsibilities/);
      }
      assert.match(html, /identity theft|identiteitsdiefstal|Identitätsdiebstahl|vol d/i);
      assert.match(text, /identity theft|identiteitsdiefstal|Identitätsdiebstahl|vol d/i);
      assert.match(
        html,
        /ne sera dévoilé qu'aux|alleen onthuld aan betalende|wird nur zahlenden|will only be revealed to paying/
      );
      assert.match(text, /482910\s+This code expires after 15 minutes|482910\s+Ce code expire après 15 minutes|482910\s+Deze code vervalt na 15 minuten|482910\s+Dieser Code läuft nach 15 Minuten ab/);
      assert.match(html, /À vous de jouer ! 😉|Aan jou om te spelen! 😉|Jetzt bist du am Zug! 😉|Your turn to play! 😉/);
      assert.equal(/À très vite !|Tot gauw!|Bis gleich!|See you soon!/.test(html), false, loc);
      const signoff = t(loc, "email.welcome.signoff");
      assert.match(html, new RegExp(`<h2 style="margin:22px 0 10px;font-size:22px;">${signoff.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/h2>`));
      const dad = t(loc, "email.dad");
      const afterSignoff = html.split(signoff)[1] || "";
      assert.equal(afterSignoff.includes(dad), false, loc);
      assert.equal(text.split(signoff)[1]?.includes(dad) || false, false, loc);
    }
  });
});

describe("language switcher persists family locale live", () => {
  it("calls setFamilyLocale when a logged-in parent changes language, not on the signup gate", () => {
    const i18n = fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n.js"), "utf8");
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(i18n, /select\.addEventListener\("change"/);
    assert.match(i18n, /setLocale\(select\.value, \{ persist: true \}\)/);
    assert.match(i18n, /if \(persist\) await persistLocaleIfSignedIn\(\)/);
    assert.match(i18n, /httpsCallable\(window\.functions, "setFamilyLocale"\)\(\{ locale/);
    assert.match(i18n, /if \(!window\.auth\?\.currentUser\)/);
    assert.match(i18n, /__replicaState\?\.familyId/);
    assert.match(i18n, /PERSIST_DEBOUNCE_MS = 400/);
    assert.match(i18n, /clearTimeout\(persistTimer\)/);
    assert.match(i18n, /window\.__replicaState\.locale = locale/);
    assert.match(gate, /flushPendingFamilyLocale/);
    assert.match(gate, /requestSignup/);
    assert.match(gate, /locale: getLocale\(\)/);
    assert.match(i18n, /export function persistLocaleIfSignedIn/);
    assert.match(i18n, /persistPending = true/);
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /exports\.setFamilyLocale = onCall/);
    assert.match(billing, /persistFamilyLocale\(familyId, locale\)/);
    assert.match(billing, /settingsRef\(familyId\)\.set\(\{ locale: loc/);
  });
});

describe("replica client uses one HTML file plus locale dicts", () => {
  it("boots i18n on the board and keeps language control in JS, not duplicated pages", () => {
    const html = fs.readFileSync(path.join(repoRoot, "replica/public/index.html"), "utf8");
    assert.match(html, /bootI18n/);
    assert.match(html, /data-i18n="gate.loginTitle"/);
    assert.match(html, /data-i18n="header.changePin"/);
    assert.equal(fs.existsSync(path.join(repoRoot, "replica/public/index.nl.html")), false);
    const i18n = fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n.js"), "utf8");
    assert.match(i18n, /lang-switcher/);
    assert.match(i18n, /replica\.locale/);
    assert.match(i18n, /setFamilyLocale/);
    assert.match(i18n, /persistLocaleIfSignedIn/);
    assert.match(i18n, /canPersistFamilyLocale/);
    assert.match(i18n, /persistFamilyLocaleNow/);
    assert.match(i18n, /flushPendingFamilyLocale/);
    assert.match(i18n, /PERSIST_DEBOUNCE_MS/);
    assert.match(i18n, /select\.addEventListener\("change", \(\) => \{\s*setLocale\(select\.value, \{ persist: true \}\);/);
    assert.match(i18n, /if \(persist\) await persistLocaleIfSignedIn\(\)/);
    assert.match(i18n, /httpsCallable\(window\.functions, "setFamilyLocale"\)\(\{ locale/);
    assert.match(i18n, /window\.auth\?\.currentUser/);
    assert.match(i18n, /__replicaState\?\.familyId/);
    assert.equal(/localeFromRequest/.test(i18n), false);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /flushPendingFamilyLocale/);
    assert.match(gate, /await applyFamilyLocale\(state\?\.locale\);\s*await flushPendingFamilyLocale\(\)/);
    assert.match(gate, /locale: getLocale\(\)/);
    assert.match(i18n, /SUPPORTED = \["nl", "fr", "de", "en"\]/);
    assert.match(i18n, /DEFAULT_LOCALE = "nl"/);
    assert.match(
      i18n,
      /<option value="nl">NL<\/option>\s*<option value="fr">FR<\/option>\s*<option value="de">DE<\/option>\s*<option value="en">EN<\/option>/
    );
    assert.match(html, /id="authPassword"/);
    assert.match(html, /data-i18n="gate.passwordHint"/);
    assert.match(html, /id="resetPassword"/);
    assert.match(html, /data-i18n="gate.checkoutCancel"/);
    assert.match(html, /id="starsGroup"/);
    assert.match(html, /id="editStarsGroup"/);
    const authChunk = html.match(/id="authPassword"[\s\S]{0,280}/)[0];
    assert.match(authChunk, /gate.passwordHint/);
    const resetChunk = html.match(/id="resetPassword"[\s\S]{0,280}/)[0];
    assert.match(resetChunk, /gate.passwordHint/);
  });
});

describe("UI locale files share the same keys", () => {
  it("keeps nl/fr/de/en dictionaries aligned and includes a sample of board/gate/admin keys", () => {
    const nl = loadUi("nl");
    const fr = loadUi("fr");
    const de = loadUi("de");
    const en = loadUi("en");
    const nlKeys = Object.keys(nl).sort();
    assert.deepEqual(Object.keys(fr).sort(), nlKeys);
    assert.deepEqual(Object.keys(de).sort(), nlKeys);
    assert.deepEqual(Object.keys(en).sort(), nlKeys);
    for (const key of [
      "lang.label",
      "gate.loginTitle",
      "gate.signupTitle",
      "header.changePin",
      "admin.recover",
      "task.bonus",
      "ui.modifier",
      "rename.prompt",
      "gate.acceptLegal",
      "footer.privacy",
      "privacy.title",
      "legal.paidNote",
      "referral.thanks",
      "gate.forgotPassword",
      "gate.passwordHint",
      "gate.checkoutLead",
      "gate.checkoutCancel",
      "header.dailyEmail",
      "terms.priceBody",
      "err.acceptedLegal",
      "gate.acceptWithdrawal",
      "err.acceptedWithdrawal",
      "header.exportData",
      "header.deleteAccount",
      "header.cancelSubscription",
      "header.billingCancelScheduled",
      "account.cancelConfirm",
      "privacy.processorsBody",
      "privacy.storageTitle",
      "privacy.storageBody",
      "terms.withdrawBody",
      "terms.productBody",
      "terms.cancelBody",
      "err.verifyMailFailed",
      "err.emailInUse",
      "err.tosNotAccepted",
      "err.createUserFailed",
    ]) {
      assert.ok(fr[key], key);
      assert.ok(nl[key], key);
      assert.ok(de[key], key);
      assert.ok(en[key], key);
    }
    assert.match(en["referral.thanks"], /^Thank you to our best recruiter currently:/);
    assert.match(en["referral.thanks"], /^Thank you /);
    assert.match(fr["referral.thanks"], /^Merci /);
    assert.match(fr["referral.thanks"], /recruteur \(ou recrutrice\)/);
    assert.equal(/parrain/i.test(fr["referral.thanks"]), false);
    assert.equal(/parrain/i.test(fr["referral.lead"]), false);
    assert.equal(/month/i.test(en["referral.thanks"]), false);
    assert.equal(/month/i.test(en["referral.lead"]), false);
    assert.match(en["gate.passwordHint"], /6/);
    assert.match(fr["gate.passwordHint"], /6/);
    for (const [code, dict] of [["nl", nl], ["fr", fr], ["de", de], ["en", en]]) {
      const lead = dict["gate.checkoutLead"];
      assert.match(lead, /2,50|€2\.50/, `${code} checkoutLead price`);
      assert.match(lead, /25/, `${code} checkoutLead yearly`);
      assert.equal(/sandbox/i.test(lead), false, `${code} checkoutLead must not mention sandbox`);
      assert.equal(/test mode/i.test(lead), false, `${code} checkoutLead must not mention test mode`);
    }
    for (const key of ["err.verifyMailFailed", "err.emailInUse", "err.tosNotAccepted", "err.createUserFailed"]) {
      for (const dict of [nl, fr, de, en]) {
        assert.ok(dict[key], key);
        assert.notEqual(dict[key], key);
        assert.match(dict[key], /./);
      }
    }
  });
});

describe("serious fault tasks omit stars", () => {
  it("hides the stars field and display for faute grave on the replica board only", () => {
    const app = fs.readFileSync(path.join(repoRoot, "replica/public/js/app.js"), "utf8");
    assert.match(app, /function starsForTask/);
    assert.match(app, /syncStarsGroup\("isSeriousFault", "starsGroup"\)/);
    assert.match(app, /syncStarsGroup\("editIsSeriousFault", "editStarsGroup"\)/);
    assert.match(app, /t\.isSeriousFault \? "" : `<span class="task-stars">/);
    const live = fs.readFileSync(path.join(repoRoot, "public/js/app.js"), "utf8");
    assert.equal(live.includes("starsForTask"), false);
    assert.equal(live.includes("starsGroup"), false);
  });
});
