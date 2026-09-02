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
  it("normalizes unknown and mixed-case locales to supported codes, default fr", () => {
    assert.equal(normalizeLocale("xx"), "fr");
    assert.equal(normalizeLocale(""), "fr");
    assert.equal(normalizeLocale(null), "fr");
    assert.equal(normalizeLocale("DE"), "de");
    assert.equal(normalizeLocale("nl-BE"), "nl");
    assert.equal(normalizeLocale("en_GB"), "en");
    assert.equal(t("zz", "err.unauthenticated"), t("fr", "err.unauthenticated"));
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
  });

  it("includes beer/coffee pricing and kidsrewardsystem@proton.me in all four welcome emails", () => {
    for (const loc of ["fr", "nl", "de", "en"]) {
      const html = welcomeVerifyEmailHtml("482910", loc);
      const text = welcomeVerifyEmailText("482910", loc);
      for (const body of [html, text]) {
        assert.match(body, /482910/, loc);
        assert.match(body, /2,50|€2\.50/);
        assert.match(body, /25/);
        assert.match(body, /bière|pintje|Bier|beer/i);
        assert.match(body, /café|koffie|Kaffee|coffee/i);
        assert.match(body, /kidsrewardsystem@proton\.me/);
      }
    }
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
  });
});

describe("UI locale files share the same keys", () => {
  it("keeps fr/nl/de/en dictionaries aligned and includes a sample of board/gate/admin keys", () => {
    const fr = loadUi("fr");
    const nl = loadUi("nl");
    const de = loadUi("de");
    const en = loadUi("en");
    const frKeys = Object.keys(fr).sort();
    assert.deepEqual(Object.keys(nl).sort(), frKeys);
    assert.deepEqual(Object.keys(de).sort(), frKeys);
    assert.deepEqual(Object.keys(en).sort(), frKeys);
    for (const key of [
      "lang.label",
      "gate.loginTitle",
      "gate.signupTitle",
      "header.changePin",
      "admin.recover",
      "task.bonus",
      "ui.modifier",
      "rename.prompt",
    ]) {
      assert.ok(fr[key], key);
      assert.ok(nl[key], key);
      assert.ok(de[key], key);
      assert.ok(en[key], key);
    }
  });
});
