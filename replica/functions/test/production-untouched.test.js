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

  it("does not add Stripe billing to Anthony's production Cloud Functions", () => {
    const index = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(index.includes("stripeWebhook"), false);
    assert.equal(index.includes("bootstrapHousehold"), false);
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
