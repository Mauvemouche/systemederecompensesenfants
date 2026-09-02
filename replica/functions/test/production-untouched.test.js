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
    const { getApps } = require("firebase-admin/app");
    const before = getApps().length;
    const fns = require("../index");
    assert.equal(typeof fns.dailyResetAndStats, "function");
    assert.equal(typeof fns.bootstrapInstance, "function");
    assert.equal(typeof fns.stripeWebhook, "function");
    assert.equal(typeof fns.renamePerson, "function");
    assert.equal(typeof fns.saveChildren, "function");
    assert.equal(typeof fns.requestSignup, "function");
    assert.equal(typeof fns.verifyEmailCode, "function");
    assert.equal(typeof fns.setAdminPin, "function");
    assert.equal(typeof fns.verifyAdminPin, "function");
    assert.equal(typeof fns.changeAdminPin, "function");
    assert.equal(typeof fns.recoverAdminPin, "function");
    assert.equal(typeof fns.setFamilyLocale, "function");
    assert.equal(typeof fns.setDailyEmailOptIn, "function");
    assert.equal(typeof fns.getOperatorLegalIdentity, "function");
    assert.equal(typeof fns.submitReferral, "function");
    assert.equal(typeof fns.skipReferral, "function");
    assert.equal(typeof fns.refreshReferralBest, "function");
    assert.equal(typeof fns.requestPasswordReset, "function");
    assert.equal(typeof fns.confirmPasswordReset, "function");
    const platform = fns.stripeWebhook.__endpoint?.platform || fns.bootstrapInstance.__endpoint?.platform;
    assert.equal(platform, "gcfv2");
    assert.equal(getApps().length, before);
  });

  it("deploy helpers always run firebase deploy and append extra args", () => {
    const js = fs.readFileSync(path.join(repoRoot, "replica/scripts/deploy.js"), "utf8");
    assert.match(js, /\["deploy", \.\.\.process\.argv\.slice\(2\)\]/);
    assert.equal(js.includes('args.length ? args : ["deploy"]'), false);
    const cmd = fs.readFileSync(path.join(repoRoot, "replica/scripts/deploy.cmd"), "utf8");
    assert.match(cmd, /firebase deploy %\*/);
  });
});

describe("replica family board rename (paid test instance only)", () => {
  it("adds a Modifier control next to each person name on the replica board", () => {
    const ui = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-ui.js"), "utf8");
    assert.match(ui, /btn-rename-person/);
    assert.match(ui, /t\("ui\.modifier"\)/);
    assert.match(ui, /personNameRow/);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /callFn\("renamePerson"/);
    assert.match(gate, /t\("rename\.prompt"\)/);
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /exports\.renamePerson/);
    assert.match(billing, /requireFamilyOwner\(uid,\s*locale\)/);
    assert.match(billing, /renamePersonInList/);
  });

  it("does not add rename controls or a rename callable to Anthony's live app", () => {
    const files = [
      "public/js/app.js",
      "public/index.html",
      "public/js/gestion-taches.js",
      "functions/index.js",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(text.includes("btn-rename-person"), false, rel);
      assert.equal(text.includes("renamePerson"), false, rel);
    }
  });
});

describe("replica parent gate UX", () => {
  it("shows #gateError inside the auth form above submit", () => {
    const html = fs.readFileSync(path.join(repoRoot, "replica/public/index.html"), "utf8");
    const form = html.match(/<form id="authForm"[\s\S]*?<\/form>/)[0];
    assert.match(form, /id="gateError"/);
    assert.ok(form.indexOf("gateError") < form.indexOf("authSubmit"));
    const cardStart = html.indexOf('class="auth-card"');
    const title = html.indexOf("authTitle");
    const err = html.indexOf('id="gateError"');
    assert.ok(err > title, "error must sit below the heading, not above the card title");
    assert.ok(cardStart < title);
  });

  it("maps Firebase auth codes through i18n and re-routes after sign-in", () => {
    const js = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    const i18n = fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n.js"), "utf8");
    for (const code of [
      "email-already-in-use",
      "invalid-credential",
      "wrong-password",
      "user-not-found",
      "weak-password",
      "invalid-email",
      "too-many-requests",
    ]) {
      assert.match(i18n, new RegExp(code));
    }
    assert.match(js, /AUTH_ERROR_KEYS/);
    assert.match(js, /auth\.\$\{code\}/);
    assert.match(js, /gate\.busyLogin/);
    assert.match(js, /gate\.busySignup/);
    assert.match(js, /const state = await refreshState\(\);\s*await routeState\(state\);/);
    assert.equal(js.includes("setError(err.message || \"Connexion impossible\")"), false);
    assert.match(js, /requestSignup/);
    assert.match(js, /verifyEmailCode/);
    assert.match(js, /requestPasswordReset/);
    assert.match(js, /confirmPasswordReset/);
    assert.equal(js.includes("createUserWithEmailAndPassword"), false);
    assert.match(js, /function translateErrorKey/);
    assert.match(js, /looksLikeI18nKey/);
    const en = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n/en.json"), "utf8"));
    for (const key of ["err.verifyMailFailed", "err.emailInUse", "err.tosNotAccepted", "err.createUserFailed"]) {
      assert.notEqual(en[key], key, key);
    }
    const signup = fs.readFileSync(path.join(repoRoot, "replica/functions/signup.js"), "utf8");
    assert.match(signup, /err\.createUserFailed/);
  });
});

describe("replica Admin PIN is per-family, live app keeps the hardcoded PIN", () => {
  it("removes the shared PIN from the replica client", () => {
    const files = [
      "replica/public/js/app.js",
      "replica/public/js/gestion-taches.js",
      "replica/public/admin.html",
      "replica/public/js/family-gate.js",
      "replica/public/index.html",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
      assert.equal(text.includes("ADMIN_PIN"), false, rel);
      assert.equal(text.includes("1571"), false, rel);
    }
    const app = fs.readFileSync(path.join(repoRoot, "replica/public/js/app.js"), "utf8");
    assert.equal(app.includes("value === ADMIN_PIN"), false);
    assert.match(app, /verifyAdminPin/);
    assert.match(app, /recoverAdminPin/);
    assert.match(app, /changeAdminPin/);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /setAdminPin/);
  });

  it("does not change Anthony's live family PIN check", () => {
    const app = fs.readFileSync(path.join(repoRoot, "public/js/app.js"), "utf8");
    assert.match(app, /const ADMIN_PIN = "1571"/);
    assert.match(app, /value === ADMIN_PIN/);
    const gestion = fs.readFileSync(path.join(repoRoot, "public/js/gestion-taches.js"), "utf8");
    assert.match(gestion, /const ADMIN_PIN = "1571"/);
  });
});
