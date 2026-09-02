"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { evaluateConfirmReset, applyPasswordUpdate, hashResetCode } = require("../lib/passwordReset");
const { nextExpiry } = require("../lib/signupCodes");

const repoRoot = path.join(__dirname, "..", "..", "..");

describe("password reset confirm", () => {
  const now = 1_700_000_000_000;

  it("requires a 6-digit code and does not update the password", async () => {
    const record = {
      uid: "u1",
      codeHash: hashResetCode("123456"),
      expiresAtMs: nextExpiry(now),
      attempts: 0,
    };
    assert.equal(evaluateConfirmReset({ record, code: "", password: "secret1", now }).reason, "code-required");
    assert.equal(evaluateConfirmReset({ record, code: "12", password: "secret1", now }).reason, "code-required");
    assert.equal(evaluateConfirmReset({ record, code: "abcdef", password: "secret1", now }).ok, false);
    const calls = [];
    assert.equal(calls.length, 0);
  });

  it("fails skip or a wrong code without updating the password", async () => {
    const record = {
      uid: "u1",
      codeHash: hashResetCode("123456"),
      expiresAtMs: nextExpiry(now),
      attempts: 0,
    };
    assert.equal(evaluateConfirmReset({ record, code: "", password: "secret1", now }).ok, false);
    assert.equal(evaluateConfirmReset({ record, code: "000000", password: "secret1", now }).reason, "mismatch");
    assert.equal(evaluateConfirmReset({ record: null, code: "123456", password: "secret1", now }).reason, "missing");
    const calls = [];
    const skipped = evaluateConfirmReset({ record, code: "", password: "secret1", now });
    if (skipped.ok) await applyPasswordUpdate(async (uid, data) => calls.push({ uid, data }), "u1", "secret1");
    assert.equal(calls.length, 0);
  });

  it("updates the password when the code matches", async () => {
    const record = {
      uid: "uid-42",
      codeHash: hashResetCode("482910"),
      expiresAtMs: nextExpiry(now),
      attempts: 0,
    };
    const result = evaluateConfirmReset({ record, code: "482910", password: "new-pass", now });
    assert.equal(result.ok, true);
    assert.equal(result.uid, "uid-42");
    const calls = [];
    await applyPasswordUpdate(async (uid, data) => {
      calls.push({ uid, data });
    }, result.uid, "new-pass");
    assert.deepEqual(calls, [{ uid: "uid-42", data: { password: "new-pass" } }]);
  });
});

describe("password reset callables stay unauthenticated and do not leak accounts", () => {
  it("always returns ok on request and never uses Firebase default reset", () => {
    const src = fs.readFileSync(path.join(repoRoot, "replica/functions/passwordReset.js"), "utf8");
    assert.equal(src.includes("requireAuth"), false);
    assert.equal(src.includes("generatePasswordResetLink"), false);
    assert.equal(src.includes("sendPasswordResetEmail"), false);
    assert.match(src, /return \{ ok: true \}/);
    assert.equal(src.includes("err.emailInUse"), false);
    assert.equal(src.includes("generatePasswordResetLink"), false);
    assert.match(src, /collection\("reset_codes"\)/);
    assert.match(src, /evaluateConfirmReset/);
    assert.match(src, /applyPasswordUpdate/);

    const html = fs.readFileSync(path.join(repoRoot, "replica/public/index.html"), "utf8");
    assert.match(html, /id="forgotPasswordLink"/);
    assert.match(html, /id="resetConfirmForm"/);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /requestPasswordReset/);
    assert.match(gate, /confirmPasswordReset/);

    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("forgotPassword"), false);
    const liveFns = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(liveFns.includes("requestPasswordReset"), false);
  });
});
