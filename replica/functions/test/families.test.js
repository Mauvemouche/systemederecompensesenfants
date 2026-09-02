"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  familyDocPath,
  familyTasksPath,
  isLegacyOwner,
  shouldMigrateLegacy,
  shouldKeepExistingMembership,
  keepMigratedLegacyFamily,
  chooseFamilyResolution,
  familyIdFromStripe,
  LEGACY_OWNER_EMAIL,
} = require("../lib/families");

describe("multi-family isolation helpers", () => {
  it("keeps family data under families/{familyId}/ not shared root collections", () => {
    assert.equal(familyDocPath("abc"), "families/abc");
    assert.equal(familyTasksPath("abc"), "families/abc/tasks");
    assert.notEqual(familyTasksPath("fam_a"), familyTasksPath("fam_b"));
  });

  it("migrates the existing singleton owner, not a second parent", () => {
    const legacy = { ownerUid: "uid_anthony", ownerEmail: LEGACY_OWNER_EMAIL };
    assert.equal(isLegacyOwner(legacy, "uid_anthony", LEGACY_OWNER_EMAIL), true);
    assert.equal(shouldMigrateLegacy(legacy, "uid_anthony", LEGACY_OWNER_EMAIL), true);
    assert.equal(shouldMigrateLegacy(legacy, "uid_other", "other@example.com"), false);
    assert.equal(
      shouldMigrateLegacy({ ...legacy, migratedToFamilyId: "fam_1" }, "uid_anthony", LEGACY_OWNER_EMAIL),
      false
    );
  });

  it("after a migrated singleton, a different parent creates a new family", () => {
    const stolen = "IimpGjvPDfZUde7fDm7F";
    const legacy = {
      ownerUid: "uid_anthony",
      ownerEmail: LEGACY_OWNER_EMAIL,
      migratedToFamilyId: stolen,
    };
    assert.equal(keepMigratedLegacyFamily(legacy, "uid_anthony", LEGACY_OWNER_EMAIL), stolen);
    assert.equal(keepMigratedLegacyFamily(legacy, "uid_b", "qa.family2@example.com"), null);

    const parentB = chooseFamilyResolution({
      uid: "uid_b",
      email: "qa.family2@example.com",
      memberFamilyId: null,
      memberFamilyBilling: null,
      legacyBilling: legacy,
    });
    assert.equal(parentB.action, "create-family");
    assert.equal(parentB.familyId, undefined);
    assert.notEqual(parentB.action, "attach-legacy");
    assert.notEqual(parentB.action, "keep-membership");

    const parentA = chooseFamilyResolution({
      uid: "uid_anthony",
      email: LEGACY_OWNER_EMAIL,
      memberFamilyId: null,
      memberFamilyBilling: null,
      legacyBilling: legacy,
    });
    assert.equal(parentA.action, "attach-legacy");
    assert.equal(parentA.familyId, stolen);
  });

  it("ignores a stolen family_members doc and creates a new family", () => {
    const stolen = "IimpGjvPDfZUde7fDm7F";
    const stolenBilling = { ownerUid: "uid_anthony", ownerEmail: LEGACY_OWNER_EMAIL };
    assert.equal(shouldKeepExistingMembership(stolenBilling, "uid_b"), false);
    assert.equal(shouldKeepExistingMembership(stolenBilling, "uid_anthony"), true);

    const parentB = chooseFamilyResolution({
      uid: "uid_b",
      email: "qa.family2@example.com",
      memberFamilyId: stolen,
      memberFamilyBilling: stolenBilling,
      legacyBilling: {
        ownerUid: "uid_anthony",
        ownerEmail: LEGACY_OWNER_EMAIL,
        migratedToFamilyId: stolen,
      },
    });
    assert.equal(parentB.action, "create-family");
    assert.notEqual(parentB.familyId, stolen);

    const owner = chooseFamilyResolution({
      uid: "uid_anthony",
      email: LEGACY_OWNER_EMAIL,
      memberFamilyId: stolen,
      memberFamilyBilling: stolenBilling,
      legacyBilling: { migratedToFamilyId: stolen, ownerUid: "uid_anthony" },
    });
    assert.equal(owner.action, "keep-membership");
    assert.equal(owner.familyId, stolen);
  });

  it("reads familyId from Stripe session/subscription metadata", () => {
    assert.equal(
      familyIdFromStripe({ metadata: { familyId: "fam_dupont" } }, { client_reference_id: "ignored" }),
      "fam_dupont"
    );
    assert.equal(familyIdFromStripe({ client_reference_id: "fam_from_ref" }), "fam_from_ref");
    assert.equal(familyIdFromStripe({ metadata: {} }, null), null);
  });
});

describe("replica platform is multi-family on one URL", () => {
  const repoRoot = path.join(__dirname, "..", "..", "..");

  it("does not block a second parent on the singleton owner trap", () => {
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.equal(billing.includes("Cette instance appartient déjà à un autre parent."), false);
    assert.match(billing, /resolveFamilyForUser/);
    assert.match(billing, /setFamilyClaim/);
    assert.match(billing, /families/);
    assert.equal(billing.includes('collection("billing").doc("current")'), false);
    assert.equal(billing.includes('collection("family_config")'), false);
    const families = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/families.js"), "utf8");
    const migrate = families.match(/async function migrateLegacySingleton[\s\S]*?async function resolveFamilyForUser/)[0];
    assert.match(migrate, /if \(legacy\.migratedToFamilyId\)/);
    assert.match(migrate, /if \(!isLegacyOwner\(legacy, uid, email\)\) \{\s*denyBecauseNotOwner = true/);
    assert.match(migrate, /if \(denyBecauseNotOwner\) return null/);
    const ownerCheck = migrate.indexOf("if (!isLegacyOwner(legacy, uid, email))");
    const assign = migrate.indexOf("familyId = legacy.migratedToFamilyId");
    assert.ok(ownerCheck >= 0 && assign > ownerCheck, "must not return migratedToFamilyId before the owner check");
    assert.match(families, /shouldKeepExistingMembership/);
    assert.match(families, /chooseFamilyResolution/);
  });

  it("scopes Firestore rules to token.familyId and denies root collections", () => {
    const rules = fs.readFileSync(path.join(repoRoot, "replica/firestore.rules"), "utf8");
    assert.match(rules, /request\.auth\.token\.familyId == familyId/);
    assert.match(rules, /match \/families\/\{familyId\}/);
    assert.equal(rules.includes("billing/current"), false);
    assert.equal(rules.includes("match /family_config"), false);
    assert.match(rules, /match \/platform\/\{docId\}/);
    assert.match(rules, /referral_best/);
    assert.equal(rules.includes("referral_month_"), false);
    assert.match(rules, /match \/referrals\/\{familyId\}/);
    assert.equal(rules.includes("function billingDoc()"), false);
  });

  it("uses per-family task paths on the replica board", () => {
    const app = fs.readFileSync(path.join(repoRoot, "replica/public/js/app.js"), "utf8");
    assert.match(app, /familyTasksCol/);
    assert.match(app, /familyTaskDoc/);
    assert.equal(app.includes('collection(window.db, "tasks")'), false);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /syncFamilyClaim/);
    assert.equal(gate.includes("Cette instance est déjà liée à un autre parent."), false);
  });

  it("keeps provision from creating a second single-tenant Firebase trap", () => {
    const script = fs.readFileSync(path.join(repoRoot, "replica/scripts/provision-replica.js"), "utf8");
    assert.match(script, /recompenses-test/);
    assert.match(script, /multi-family/);
    assert.match(script, /single-tenant trap/);
    assert.equal(script.includes("First parent to sign up owns the instance"), false);
  });
});
