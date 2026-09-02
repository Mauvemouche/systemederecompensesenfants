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

  it("picks replica Firebase config by hostname (test vs kidsrewardsystem, never Anthony's project)", async () => {
    const cfg = fs.readFileSync(path.join(repoRoot, "replica/public/js/firebase-config.js"), "utf8");
    assert.equal(cfg.includes("systemederecompensesenfants"), false);
    assert.equal(/measurementId\s*:/.test(cfg), false);
    assert.match(cfg, /kidsrewardsystem\.com/);
    assert.match(cfg, /www\.kidsrewardsystem\.com/);
    assert.match(cfg, /kidsrewardsystem\.web\.app/);
    assert.match(cfg, /kidsrewardsystem\.firebaseapp\.com/);
    assert.match(cfg, /AIzaSyC28xeJVbWCTZsA8dx8LScBM9qn8M9-nk4/);
    assert.match(cfg, /1:817182317925:web:65de3d62e5d18d0060d58c/);
    assert.match(cfg, /AIzaSyB8nedRkn_wTGkIiMKXFioCNm3mQySVCOE/);
    assert.match(cfg, /projectId: "recompenses-test"/);
    assert.match(cfg, /projectId: "kidsrewardsystem"/);
    assert.match(cfg, /firebaseConfigForHostname/);
    assert.equal(cfg.includes("YOUR_REPLICA_PROJECT_ID"), false);

    const { pathToFileURL } = require("node:url");
    const mod = await import(pathToFileURL(path.join(repoRoot, "replica/public/js/firebase-config.js")).href);
    assert.equal(mod.FUNCTIONS_REGION, "europe-west1");
    assert.equal(mod.firebaseConfigForHostname("kidsrewardsystem.com").projectId, "kidsrewardsystem");
    assert.equal(mod.firebaseConfigForHostname("www.kidsrewardsystem.com").projectId, "kidsrewardsystem");
    assert.equal(mod.firebaseConfigForHostname("kidsrewardsystem.web.app").projectId, "kidsrewardsystem");
    assert.equal(mod.firebaseConfigForHostname("kidsrewardsystem.firebaseapp.com").projectId, "kidsrewardsystem");
    assert.equal(mod.firebaseConfigForHostname("recompenses-test.web.app").projectId, "recompenses-test");
    assert.equal(mod.firebaseConfigForHostname("localhost").projectId, "recompenses-test");
    assert.equal(mod.firebaseConfig.projectId, "recompenses-test");
    assert.equal(mod.firebaseConfigForHostname("kidsrewardsystem.com").appId, "1:817182317925:web:65de3d62e5d18d0060d58c");
    assert.equal("measurementId" in mod.firebaseConfigForHostname("kidsrewardsystem.com"), false);
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

describe("replica functions bind mail and operator secrets without crashing at boot", () => {
  it("uses Node 22 and does not depend on unused heavy packages", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/functions/package.json"), "utf8"));
    assert.equal(pkg.engines.node, "22");
    assert.equal(pkg.dependencies["@google-cloud/scheduler"], undefined);
    assert.equal(pkg.dependencies.resend, undefined);
  });

  it("binds EMAIL_* and OPERATOR_* secrets only on the functions that need them", () => {
    const callable = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/callable.js"), "utf8");
    assert.match(callable, /defineSecret\(\s*"EMAIL_USER"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"EMAIL_PASSWORD"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"EMAIL_FROM"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"EMAIL_REPLY_TO"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"EMAIL_SMTP_HOST"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"EMAIL_SMTP_PORT"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"STRIPE_PRICE_MONTHLY"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"STRIPE_PRICE_YEARLY"\s*\)/);
    assert.match(callable, /defineSecret\(\s*"STRIPE_SECRET_KEY"\s*\)/);
    assert.equal(/STRIPE_PRICE_MONTHLY\.value\s*\(/.test(callable), false);
    assert.match(callable, /CALLABLE_MAIL/);
    assert.match(callable, /CALLABLE_OPERATOR/);
    assert.equal(/EMAIL_USER\.value\s*\(/.test(callable), false);
    assert.equal(/EMAIL_PASSWORD\.value\s*\(/.test(callable), false);
    assert.equal(/OPERATOR_LEGAL_NAME\.value\s*\(/.test(callable), false);
    assert.equal(/OPERATOR_STREET_ADDRESS\.value\s*\(/.test(callable), false);

    const signup = fs.readFileSync(path.join(repoRoot, "replica/functions/signup.js"), "utf8");
    assert.match(signup, /exports\.requestSignup = onCall\(\s*CALLABLE_MAIL/);
    assert.match(signup, /exports\.verifyEmailCode = onCall\(\s*CALLABLE,/);

    const pin = fs.readFileSync(path.join(repoRoot, "replica/functions/adminPin.js"), "utf8");
    assert.match(pin, /exports\.recoverAdminPin = onCall\(\s*CALLABLE_MAIL/);
    assert.match(pin, /exports\.setAdminPin = onCall\(\s*CALLABLE,/);

    const reset = fs.readFileSync(path.join(repoRoot, "replica/functions/passwordReset.js"), "utf8");
    assert.match(reset, /exports\.requestPasswordReset = onCall\(\s*CALLABLE_MAIL/);
    assert.match(reset, /exports\.confirmPasswordReset = onCall\(\s*CALLABLE,/);

    const index = fs.readFileSync(path.join(repoRoot, "replica/functions/index.js"), "utf8");
    assert.match(index, /exports\.dailyResetAndStats/);
    assert.match(index, /secrets:\s*EMAIL_SECRETS/);
    assert.equal(/^const nodemailer = require/m.test(index), false);
    assert.equal(/^admin\.initializeApp\(\)/m.test(index), false);

    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /exports\.getOperatorLegalIdentity = onCall\(\s*CALLABLE_OPERATOR/);
    assert.match(billing, /exports\.createCheckoutSession = onCall\(\s*CALLABLE_STRIPE/);
    assert.equal(/EMAIL_USER/.test(billing), false);
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

    const secretKeys = (fn) =>
      (fn.__endpoint?.secretEnvironmentVariables || []).map((s) => s.key);
    for (const name of ["EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_FROM", "EMAIL_REPLY_TO", "EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT"]) {
      assert.equal(secretKeys(fns.requestSignup).includes(name), true, name);
      assert.equal(secretKeys(fns.recoverAdminPin).includes(name), true, name);
      assert.equal(secretKeys(fns.requestPasswordReset).includes(name), true, name);
      assert.equal(secretKeys(fns.dailyResetAndStats).includes(name), true, name);
      assert.equal(secretKeys(fns.createCheckoutSession).includes(name), false, name);
      assert.equal(secretKeys(fns.verifyEmailCode).includes(name), false, name);
    }
    assert.equal(secretKeys(fns.getOperatorLegalIdentity).includes("OPERATOR_LEGAL_NAME"), true);
    assert.equal(secretKeys(fns.getOperatorLegalIdentity).includes("OPERATOR_STREET_ADDRESS"), true);
    assert.equal(secretKeys(fns.getOperatorLegalIdentity).includes("STRIPE_SECRET_KEY"), true);
    assert.equal(secretKeys(fns.createCheckoutSession).includes("STRIPE_SECRET_KEY"), true);
    assert.equal(secretKeys(fns.createCheckoutSession).includes("STRIPE_PRICE_MONTHLY"), true);
    assert.equal(secretKeys(fns.createCheckoutSession).includes("STRIPE_PRICE_YEARLY"), true);
    assert.equal(secretKeys(fns.stripeWebhook).includes("STRIPE_PRICE_MONTHLY"), true);
    assert.equal(secretKeys(fns.stripeWebhook).includes("STRIPE_PRICE_YEARLY"), true);
    assert.equal(secretKeys(fns.createCheckoutSession).includes("OPERATOR_LEGAL_NAME"), false);
  });

  it("tracks replica/.firebaserc with test default and kidsrewardsystem prod alias", () => {
    const rc = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/.firebaserc"), "utf8"));
    assert.equal(rc.projects.default, "recompenses-test");
    assert.equal(rc.projects.prod, "kidsrewardsystem");
    const ignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
    assert.equal(/^replica\/\.firebaserc\s*$/m.test(ignore), false);
  });

  it("deploy helpers always run firebase deploy and append extra args", () => {
    const js = fs.readFileSync(path.join(repoRoot, "replica/scripts/deploy.js"), "utf8");
    assert.match(js, /\["deploy", \.\.\.process\.argv\.slice\(2\)\]/);
    assert.equal(js.includes('args.length ? args : ["deploy"]'), false);
    const cmd = fs.readFileSync(path.join(repoRoot, "replica/scripts/deploy.cmd"), "utf8");
    assert.match(cmd, /firebase deploy %\*/);
  });

  it("documents one-time Secret Manager set commands and no Cloud Run env-var workaround", () => {
    const readme = fs.readFileSync(path.join(repoRoot, "replica/README.md"), "utf8");
    assert.match(readme, /firebase functions:secrets:set EMAIL_USER --project recompenses-test/);
    assert.match(readme, /firebase functions:secrets:set EMAIL_PASSWORD --project recompenses-test/);
    assert.match(readme, /firebase functions:secrets:set OPERATOR_LEGAL_NAME --project recompenses-test/);
    assert.match(readme, /gcloud secrets create EMAIL_USER/);
    assert.match(readme, /europe-west1/);
    assert.match(readme, /update-env-vars/);
    assert.match(readme, /contact@kidsrewardsystem\.com/);
    assert.match(readme, /kidsrewardsystem\.com/);
    assert.match(readme, /--project kidsrewardsystem/);
    assert.match(readme, /AnthonyRsca LIVE|live price/i);
    assert.match(readme, /Never copy[\s`'"]+sk_test/i);
    assert.match(readme, /STRIPE_PRICE_MONTHLY/);
    assert.match(readme, /STRIPE_PRICE_YEARLY/);
    assert.match(readme, /Never.*systemederecompensesenfants/s);
    assert.equal(/sk_live_[A-Za-z0-9]+/.test(readme), false);
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
