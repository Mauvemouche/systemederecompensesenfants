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
