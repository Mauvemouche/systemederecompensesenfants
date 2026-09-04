"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  SECRET_KEYS,
  FAMILY_SUBCOLLECTIONS,
  stripSecrets,
  billingMetadataForExport,
  settingsForExport,
  legalAcceptPatch,
  legalAcceptanceFromFamily,
  buildFamilyExport,
  stripeSubscriptionCancelPath,
  relatedDocsToDelete,
} = require("../lib/gdpr");

const repoRoot = path.join(__dirname, "..", "..", "..");

describe("family data export sanitizes secrets and stays on one family", () => {
  it("strips PIN hashes and other secrets from settings and tasks", () => {
    const settings = settingsForExport({
      name: "Dupont",
      kidsNamed: true,
      locale: "fr",
      dailyEmailOptIn: false,
      adminPinHash: "scrypt$secret$hash",
      people: [{ id: "lea", name: "Léa", role: "child", theme: "child-a" }],
    });
    assert.equal(settings.adminPinHash, undefined);
    assert.equal(JSON.stringify(settings).includes("scrypt"), false);
    assert.equal(settings.people[0].name, "Léa");
    assert.equal(settings.dailyEmailOptIn, false);

    const cleaned = stripSecrets({
      title: "Ranger",
      adminPinHash: "x",
      codeHash: "y",
      password: "z",
    });
    assert.equal(cleaned.title, "Ranger");
    assert.equal(cleaned.adminPinHash, undefined);
    assert.equal(cleaned.codeHash, undefined);
    assert.ok(SECRET_KEYS.has("adminPinHash"));
  });

  it("exports only billing metadata and the requested family id", () => {
    const payload = buildFamilyExport({
      familyId: "fam_a",
      family: {
        ownerEmail: "parent@example.com",
        locale: "nl",
        acceptedLegal: true,
        acceptedLegalAt: { _seconds: 1700000000 },
        acceptedLegalLocale: "nl",
        acceptedWithdrawal: true,
        acceptedWithdrawalLocale: "nl",
      },
      settings: {
        people: [{ id: "kid-1", name: "Léa", role: "child" }],
        adminPinHash: "secret",
        locale: "nl",
      },
      billing: {
        status: "trialing",
        plan: "monthly",
        ownerEmail: "parent@example.com",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        complimentaryForever: false,
        checkoutSessionId: "cs_test_1",
      },
      tasks: [{ id: "t1", title: "Tidy", assignedTo: "kid-1", adminPinHash: "nope" }],
      users: [{ id: "uid_1", email: "parent@example.com", role: "parent" }],
    });
    assert.equal(payload.familyId, "fam_a");
    assert.equal(payload.profile.ownerEmail, "parent@example.com");
    assert.equal(payload.people[0].name, "Léa");
    assert.equal(payload.tasks[0].title, "Tidy");
    assert.equal(payload.tasks[0].adminPinHash, undefined);
    assert.equal(payload.settings.adminPinHash, undefined);
    assert.equal(payload.billing.stripeCustomerId, "cus_1");
    assert.equal(payload.billing.stripeSubscriptionId, "sub_1");
    assert.equal(payload.legalAcceptance.acceptedLegal, true);
    assert.equal(payload.legalAcceptance.acceptedWithdrawal, true);
    assert.equal(JSON.stringify(payload).includes("fam_b"), false);
    assert.equal(JSON.stringify(payload).includes("scrypt"), false);
    assert.equal(JSON.stringify(payload).includes("secret"), false);

    const meta = billingMetadataForExport({ status: "active", complimentaryForever: true });
    assert.equal(meta.complimentaryForever, true);
    assert.equal(meta.status, "active");
  });
});

describe("legal acceptance is stored on the family, not a parallel store", () => {
  it("patches acceptedLegal and acceptedWithdrawal with timestamp and locale", () => {
    const now = { seconds: 1 };
    const both = legalAcceptPatch({ termsPrivacy: true, withdrawal: true, locale: "fr", now });
    assert.equal(both.acceptedLegal, true);
    assert.equal(both.acceptedLegalLocale, "fr");
    assert.equal(both.acceptedWithdrawal, true);
    assert.equal(both.acceptedWithdrawalLocale, "fr");
    assert.equal(both.acceptedLegalAt, now);
    const fromFam = legalAcceptanceFromFamily({
      acceptedLegal: true,
      acceptedLegalLocale: "de",
      acceptedWithdrawal: true,
    });
    assert.equal(fromFam.acceptedLegal, true);
    assert.equal(fromFam.acceptedLegalLocale, "de");
    const families = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/families.js"), "utf8");
    assert.match(families, /legalAcceptPatch\(\{ termsPrivacy: true/);
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /acceptedWithdrawal !== true/);
    assert.match(billing, /legalAcceptPatch\(\{ termsPrivacy: true, withdrawal: true/);
  });
});

describe("account deletion cancels Stripe then wipes only that family", () => {
  it("builds a Stripe subscription DELETE path and related index docs", () => {
    assert.equal(stripeSubscriptionCancelPath("sub_123"), "/subscriptions/sub_123");
    assert.equal(stripeSubscriptionCancelPath(""), null);
    assert.equal(stripeSubscriptionCancelPath("cus_123"), null);
    const related = relatedDocsToDelete("fam_a", "uid_1", "cus_1");
    assert.deepEqual(related, [
      { collection: "family_members", id: "uid_1" },
      { collection: "stripe_customers", id: "cus_1" },
      { collection: "referrals", id: "fam_a" },
    ]);
    assert.ok(FAMILY_SUBCOLLECTIONS.includes("tasks"));
    assert.ok(FAMILY_SUBCOLLECTIONS.includes("settings"));
    assert.ok(FAMILY_SUBCOLLECTIONS.includes("billing"));
  });

  it("exports owner-only callables that cancel Stripe and delete Auth + Firestore", () => {
    const gdpr = fs.readFileSync(path.join(repoRoot, "replica/functions/gdpr.js"), "utf8");
    assert.match(gdpr, /exports\.exportFamilyData = onCall/);
    assert.match(gdpr, /exports\.deleteFamilyAccount = onCall/);
    assert.match(gdpr, /requireFamilyOwner/);
    assert.match(gdpr, /billing\.ownerUid !== uid/);
    assert.match(gdpr, /deleteUser/);
    assert.match(gdpr, /cancelFamilySubscription/);
    assert.match(gdpr, /stripeRequest\("DELETE"/);
    assert.match(gdpr, /FAMILY_SUBCOLLECTIONS/);
    assert.match(gdpr, /confirm !== true/);
    assert.match(gdpr, /complimentaryForever/);
    const index = fs.readFileSync(path.join(repoRoot, "replica/functions/index.js"), "utf8");
    assert.match(index, /require\("\.\/gdpr"\)/);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /exportFamilyData/);
    assert.match(gate, /deleteFamilyAccount/);
    assert.match(gate, /account\.deleteConfirm/);
    const html = fs.readFileSync(path.join(repoRoot, "replica/public/index.html"), "utf8");
    assert.match(html, /id="exportDataBtn"/);
    assert.match(html, /id="deleteAccountBtn"/);
    assert.match(html, /id="cancelSubBtn"/);
    const liveFns = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(liveFns.includes("exportFamilyData"), false);
    assert.equal(liveFns.includes("deleteFamilyAccount"), false);
    assert.equal(liveFns.includes("cancelSubscription"), false);
    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("exportDataBtn"), false);
    assert.equal(liveIndex.includes("deleteAccountBtn"), false);
    assert.equal(liveIndex.includes("cancelSubBtn"), false);
  });
});

describe("replica legal copy does not introduce SendGrid or child extra data collection", () => {
  it("keeps Proton mail and does not collect child photo, school, or health notes", () => {
    const mailer = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/mailer.js"), "utf8");
    assert.match(mailer, /EMAIL_SMTP_HOST|proton/i);
    assert.equal(/sendgrid|@sendgrid/i.test(mailer), false);
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/functions/package.json"), "utf8"));
    assert.equal(pkg.dependencies["@sendgrid/mail"], undefined);
    const privacy = fs.readFileSync(path.join(repoRoot, "replica/public/privacy.html"), "utf8");
    assert.match(privacy, /privacy.registerTitle/);
    assert.match(privacy, /class="legal-register"/);
    assert.match(privacy, /privacy.minimiseBody/);
    assert.match(privacy, /privacy.rightsBody/);
  });
});
