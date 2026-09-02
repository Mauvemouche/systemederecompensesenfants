"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..", "..");

describe("Anthony's live family app stays a separate instance", () => {
  it("keeps Florent & Harry hardcoded on the production board", () => {
    const app = fs.readFileSync(path.join(repoRoot, "public/js/app.js"), "utf8");
    assert.match(app, /const PEOPLE = \["papa", "maman", "florent", "harry"\]/);
    assert.match(app, /const CHILDREN = new Set\(\["florent", "harry"\]\)/);
  });

  it("does not add household tenancy to production Firestore rules", () => {
    const rules = fs.readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
    assert.equal(rules.includes("match /households/"), false);
    assert.match(rules, /assignedTo in \['papa', 'maman', 'bastien', 'florent'\]/);
  });

  it("keeps production Cloud Functions on Node 20", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "functions/package.json"), "utf8"));
    assert.equal(pkg.engines.node, "20");
  });

  it("does not add Stripe billing to Anthony's production Cloud Functions", () => {
    const index = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(index.includes("stripeWebhook"), false);
    assert.equal(index.includes("bootstrapHousehold"), false);
    assert.match(index, /firebase-functions\/v1/);
    assert.match(index, /const PEOPLE = \["papa", "maman", "florent", "harry"\]/);
  });

  it("keeps replica firebase config as placeholders, not Anthony's project", () => {
    const cfg = fs.readFileSync(path.join(repoRoot, "replica/public/js/firebase-config.js"), "utf8");
    assert.equal(cfg.includes("systemederecompensesenfants"), false);
    assert.match(cfg, /YOUR_REPLICA_PROJECT_ID/);
  });
});

describe("replica template does not leak Anthony's family defaults", () => {
  it("gestion-taches person selects default to Kid 1 and Kid 2, not Florent or Harry", () => {
    const html = fs.readFileSync(path.join(repoRoot, "replica/public/gestion-taches.html"), "utf8");
    assert.equal(/option[^>]*value=["']florent["']/i.test(html), false);
    assert.equal(/option[^>]*value=["']harry["']/i.test(html), false);
    assert.equal(html.includes("Florent"), false);
    assert.equal(html.includes("Harry"), false);
    assert.match(html, /option value="papa">Papa</);
    assert.match(html, /option value="maman">Maman</);
    assert.match(html, /option value="kid-1">Kid 1</);
    assert.match(html, /option value="kid-2">Kid 2</);
  });

  it("other replica person lists use Kid 1 and Kid 2", () => {
    const files = [
      "replica/public/index.html",
      "replica/public/manage-tasks-person.html",
    ];
    for (const rel of files) {
      const html = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(html.includes("Florent"), false, rel);
      assert.equal(html.includes("Harry"), false, rel);
      assert.match(html, /option value="kid-1">Kid 1</);
      assert.match(html, /option value="kid-2">Kid 2</);
    }
  });

  it("reset admin email has no pierre.thonon@gmail.com default", () => {
    const files = [
      "replica/public/js/reset-admin-standalone.js",
      "replica/public/js/reset-admin.js",
      "replica/public/js/firebase-config.js",
      "replica/public/admin.html",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(text.includes("pierre.thonon@gmail.com"), false, rel);
    }
    const cfg = fs.readFileSync(path.join(repoRoot, "replica/public/js/firebase-config.js"), "utf8");
    assert.match(cfg, /export const RESET_NOTIFICATION_EMAIL = ""/);
  });
});

describe("replica functions deploy without optional email secrets", () => {
  it("uses Node 22 and does not depend on unused heavy packages", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/functions/package.json"), "utf8"));
    assert.equal(pkg.engines.node, "22");
    assert.equal(pkg.dependencies["@google-cloud/scheduler"], undefined);
    assert.equal(pkg.dependencies.resend, undefined);
  });

  it("does not bind EMAIL_* secrets on dailyResetAndStats", () => {
    const files = [
      "replica/functions/index.js",
      "replica/functions/billing.js",
      "replica/functions/lib/callable.js",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(/defineSecret\(\s*["']EMAIL_/.test(src), false, rel);
      assert.equal(/secrets:\s*\[[^\]]*EMAIL_/.test(src), false, rel);
    }
    const index = fs.readFileSync(path.join(repoRoot, "replica/functions/index.js"), "utf8");
    assert.match(index, /exports\.dailyResetAndStats/);
    assert.equal(/^const nodemailer = require/m.test(index), false);
    assert.equal(/^admin\.initializeApp\(\)/m.test(index), false);
  });

  it("uses 2nd gen functions, not App Engine 1st gen", () => {
    const files = [
      "replica/functions/index.js",
      "replica/functions/billing.js",
      "replica/functions/lib/callable.js",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(src.includes("firebase-functions/v1"), false, rel);
    }
    const index = fs.readFileSync(path.join(repoRoot, "replica/functions/index.js"), "utf8");
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(index, /firebase-functions\/v2/);
    assert.match(index, /onSchedule/);
    assert.match(billing, /onCall/);
    assert.match(billing, /onRequest/);
  });

  it("loads function exports without initializing the Admin SDK", () => {
    const fns = require("../index");
    assert.equal(typeof fns.dailyResetAndStats, "function");
    assert.equal(typeof fns.bootstrapInstance, "function");
    assert.equal(typeof fns.stripeWebhook, "function");
    const platform = fns.stripeWebhook.__endpoint?.platform || fns.bootstrapInstance.__endpoint?.platform;
    assert.equal(platform, "gcfv2");
    const admin = require("firebase-admin");
    assert.equal(admin.apps.length, 0);
  });
});
