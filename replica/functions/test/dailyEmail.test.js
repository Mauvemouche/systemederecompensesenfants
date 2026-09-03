"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { t, normalizeLocale } = require("../lib/i18n");
const {
  familyLocale,
  weekdayName,
  dailySummarySubject,
  generateEmailHtml,
  dailySummaryFromSettings,
} = require("../lib/dailyEmail");

const PEOPLE = [
  { id: "papa", name: "Papa", role: "parent" },
  { id: "maman", name: "Maman", role: "parent" },
  { id: "florent", name: "Florent", role: "child" },
  { id: "harry", name: "Harry", role: "child" },
];

function sampleStats(overrides = {}) {
  return {
    date: "2026-09-02",
    dayName: "Mercredi",
    dayOfWeek: 3,
    byPerson: {
      papa: {
        normalEarned: 6,
        normalTotal: 9,
        bonusStars: 2,
        penaltyStars: 1,
        seriousFault: false,
        finalStars: 7,
        percent: 78,
        tasksDone: 3,
        tasksTotal: 4,
      },
      maman: {
        normalEarned: 3,
        normalTotal: 3,
        bonusStars: 0,
        penaltyStars: 0,
        seriousFault: false,
        finalStars: 3,
        percent: 100,
        tasksDone: 1,
        tasksTotal: 1,
      },
      florent: {
        normalEarned: 0,
        normalTotal: 6,
        bonusStars: 0,
        penaltyStars: 0,
        seriousFault: true,
        finalStars: 0,
        percent: 0,
        tasksDone: 1,
        tasksTotal: 2,
      },
      harry: {
        normalEarned: 4,
        normalTotal: 6,
        bonusStars: 0,
        penaltyStars: 2,
        seriousFault: false,
        finalStars: 2,
        percent: 33,
        tasksDone: 2,
        tasksTotal: 3,
      },
    },
    global: { totalStars: 12, maxStars: 24, percent: 50 },
    ...overrides,
  };
}

describe("daily summary locale helpers", () => {
  it("reads settings.locale and falls back to DEFAULT_LOCALE nl", () => {
    assert.equal(familyLocale({ locale: "en" }), "en");
    assert.equal(familyLocale({ locale: "FR" }), "fr");
    assert.equal(familyLocale({ locale: "en_GB" }), "en");
    assert.equal(familyLocale({ locale: "xx" }), "nl");
    assert.equal(familyLocale({}), "nl");
    assert.equal(familyLocale(null), "nl");
    assert.equal(normalizeLocale(undefined), "nl");
  });

  it("localizes weekday names instead of hardcoded French", () => {
    assert.equal(weekdayName("fr", 3), "Mercredi");
    assert.equal(weekdayName("nl", 3), "Woensdag");
    assert.equal(weekdayName("de", 3), "Mittwoch");
    assert.equal(weekdayName("en", 3), "Wednesday");
    assert.equal(weekdayName("fr", 0), "Dimanche");
    assert.equal(weekdayName("nl", 0), "Zondag");
  });
});

describe("generateEmailHtml follows family locale", () => {
  it("renders FR vs NL (and DE/EN) labels, lang, and weekdays from locale", () => {
    const fr = generateEmailHtml(sampleStats(), 2, 1, true, PEOPLE, "fr");
    const nl = generateEmailHtml(sampleStats(), 2, 1, true, PEOPLE, "nl");
    const de = generateEmailHtml(sampleStats(), 2, 1, true, PEOPLE, "de");
    const en = generateEmailHtml(sampleStats(), 2, 1, true, PEOPLE, "en");

    assert.match(fr, /lang="fr"/);
    assert.match(nl, /lang="nl"/);
    assert.match(de, /lang="de"/);
    assert.match(en, /lang="en"/);

    assert.match(fr, /<title>Rapport<\/title>/);
    assert.match(nl, /<title>Rapport<\/title>/);
    assert.match(de, /<title>Bericht<\/title>/);
    assert.match(en, /<title>Report<\/title>/);

    assert.match(fr, /✅ Rapport — Mercredi 2026-09-02/);
    assert.match(nl, /✅ Rapport — Woensdag 2026-09-02/);
    assert.match(de, /✅ Bericht — Mittwoch 2026-09-02/);
    assert.match(en, /✅ Report — Wednesday 2026-09-02/);

    assert.match(fr, /Score global/);
    assert.match(nl, /Globale score/);
    assert.match(de, /Gesamtscore/);
    assert.match(en, /Overall score/);

    assert.match(fr, /Membre/);
    assert.match(nl, /Lid/);
    assert.match(de, /Mitglied/);
    assert.match(en, /Member/);

    assert.match(fr, /Score &amp; détails|Score & détails/);
    assert.match(nl, /Score &amp; details|Score & details/);
    assert.match(en, /Score &amp; details|Score & details/);

    assert.match(fr, /Pénalités/);
    assert.match(nl, /Straffen/);
    assert.match(de, /Strafen/);
    assert.match(en, /Penalties/);

    assert.match(fr, /Faute grave/);
    assert.match(nl, /Ernstige fout/);
    assert.match(de, /Schwerer Fehler/);
    assert.match(en, /Serious fault/);

    assert.match(fr, /<b>OUI<\/b>/);
    assert.match(nl, /<b>JA<\/b>/);
    assert.match(de, /<b>JA<\/b>/);
    assert.match(en, /<b>YES<\/b>/);

    assert.match(fr, /tâches/);
    assert.match(nl, /taken/);
    assert.match(de, /Aufgaben/);
    assert.match(en, /tasks/);

    assert.match(fr, /Mensuel/);
    assert.match(nl, /Maandelijks/);
    assert.match(de, /Monatlich/);
    assert.match(en, /Monthly/);

    assert.match(fr, /Ponctuel/);
    assert.match(nl, /Eenmalig/);
    assert.match(de, /Einmalig/);
    assert.match(en, /One-off/);

    assert.match(fr, /Rapport généré automatiquement — Système de récompenses/);
    assert.match(nl, /Rapport automatisch gegenereerd — Beloningssysteem/);
    assert.match(de, /Bericht automatisch erstellt — Belohnungssystem/);
    assert.match(en, /Report generated automatically — Rewards system/);

    assert.equal(/Score global/.test(nl), false);
    assert.equal(/Score global/.test(en), false);
    assert.equal(/Faute grave/.test(en), false);
    assert.equal(/lang="fr"/.test(en), false);
  });

  it("keeps stored person names and the same score math across locales", () => {
    for (const loc of ["nl", "fr", "de", "en"]) {
      const html = generateEmailHtml(sampleStats(), 2, 1, false, PEOPLE, loc);
      assert.match(html, /Florent/);
      assert.match(html, /Harry/);
      assert.match(html, /Papa/);
      assert.match(html, /Maman/);
      assert.match(html, /7 \/ 9 ⭐/);
      assert.match(html, /12 ⭐<\/b> \/ 24/);
      assert.match(html, /50%/);
      assert.match(html, /<b>4<\/b> \/ 6/);
      assert.match(html, /2 \/ 6 ⭐/);
      assert.equal(/Kid 1/.test(html), false);
    }
  });

  it("defaults missing locale to nl, not French", () => {
    const html = generateEmailHtml(sampleStats(), 0, 0, false, PEOPLE);
    assert.match(html, /lang="nl"/);
    assert.match(html, /Globale score/);
    assert.equal(/Score global/.test(html), false);
    assert.equal(/Rapport Quotidien/.test(html), false);
  });
});

describe("daily mail uses the family's stored settings.locale", () => {
  it("does not send Rapport Quotidien when settings.locale is en", () => {
    const stats = sampleStats();
    const en = dailySummaryFromSettings({ locale: "en" }, stats, 2, 1, true, PEOPLE);
    const fr = dailySummaryFromSettings({ locale: "fr" }, stats, 2, 1, true, PEOPLE);
    const switched = dailySummaryFromSettings({ locale: "en" }, stats, 2, 1, true, PEOPLE);

    assert.equal(en.locale, "en");
    assert.match(en.subject, /Daily Report/);
    assert.equal(/Rapport Quotidien/.test(en.subject), false);
    assert.equal(/Rapport Quotidien/.test(en.html), false);
    assert.match(en.html, /lang="en"/);

    assert.match(fr.subject, /Rapport Quotidien/);
    assert.match(fr.subject, /Mercredi/);
    assert.match(en.subject, /Wednesday/);

    assert.equal(switched.locale, "en");
    assert.equal(/Rapport Quotidien/.test(switched.subject), false);
    assert.equal(switched.subject, dailySummarySubject("en", "Wednesday", "2026-09-02"));
  });

  it("uses the updated settings.locale after a live language change", () => {
    const stats = sampleStats();
    const settings = { locale: "fr" };
    const before = dailySummaryFromSettings(settings, stats, 1, 0, false, PEOPLE);
    assert.match(before.subject, /Rapport Quotidien/);

    settings.locale = "nl";
    const after = dailySummaryFromSettings(settings, stats, 1, 0, false, PEOPLE);
    assert.equal(after.locale, "nl");
    assert.match(after.subject, /Dagelijks rapport/);
    assert.equal(/Rapport Quotidien/.test(after.subject), false);
    assert.match(after.html, /lang="nl"/);
    assert.match(after.html, /Globale score/);
    assert.match(after.html, /Florent/);
  });

  it("keeps identical backend locale keys including email.daily.*", () => {
    const { LOCALES } = require("../lib/locales");
    const keys = Object.keys(LOCALES.nl).sort();
    assert.deepEqual(Object.keys(LOCALES.fr).sort(), keys);
    assert.deepEqual(Object.keys(LOCALES.de).sort(), keys);
    assert.deepEqual(Object.keys(LOCALES.en).sort(), keys);
    for (const key of [
      "email.daily.subject",
      "email.daily.title",
      "email.daily.globalScore",
      "email.daily.member",
      "email.daily.footer",
      "email.daily.day.0",
      "email.daily.day.6",
    ]) {
      assert.ok(LOCALES.nl[key], key);
      assert.ok(LOCALES.fr[key], key);
      assert.ok(LOCALES.de[key], key);
      assert.ok(LOCALES.en[key], key);
    }
    assert.match(t("fr", "email.daily.subject", { dayName: "Lundi", date: "2026-09-01" }), /Rapport Quotidien/);
    assert.match(t("en", "email.daily.subject", { dayName: "Monday", date: "2026-09-01" }), /Daily Report/);
  });
});

describe("daily cron wires stored family locale into the email", () => {
  it("reads settings.locale, not request locale, and passes locale to sendMail", () => {
    const cron = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");
    assert.match(cron, /familyLocale\(settings\)/);
    assert.match(cron, /dailySummaryFromSettings\(settings,/);
    assert.match(cron, /sendEmail\(mail\.subject, mail\.html, ownerEmail, mail\.locale\)/);
    assert.match(cron, /sendMail\(\{[\s\S]*locale,/);
    assert.equal(/DAY_NAMES_FR/.test(cron), false);
    assert.equal(/Rapport Quotidien - \$\{/.test(cron), false);
    assert.equal(/localeFromRequest/.test(cron), false);
    assert.match(cron, /require\("\.\/lib\/dailyEmail"\)/);
  });
});
