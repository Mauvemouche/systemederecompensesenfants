"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  CODE_TTL_MS,
  evaluateVerify,
  isCodeExpired,
  canResend,
  nextExpiry,
  generateSixDigitCode,
  isValidSixDigitCode,
  isValidSignupPassword,
  MIN_SIGNUP_PASSWORD_LENGTH,
  MAX_SIGNUP_PASSWORD_LENGTH,
} = require("../lib/signupCodes");

describe("signup verification codes", () => {
  it("expires after 15 minutes without waiting", () => {
    const issuedAt = 1_700_000_000_000;
    const record = { expiresAtMs: nextExpiry(issuedAt), attempts: 0 };
    assert.equal(isCodeExpired(record, issuedAt + 60 * 1000), false);
    assert.equal(isCodeExpired(record, issuedAt + CODE_TTL_MS - 1), false);
    assert.equal(isCodeExpired(record, issuedAt + CODE_TTL_MS), true);
    assert.equal(isCodeExpired(record, issuedAt + CODE_TTL_MS + 1), true);
    assert.equal(evaluateVerify(record, true, issuedAt + CODE_TTL_MS).ok, false);
    assert.equal(evaluateVerify(record, true, issuedAt + CODE_TTL_MS).reason, "expired");
    assert.equal(evaluateVerify(record, true, issuedAt + 60 * 1000).ok, true);
  });

  it("rejects a matching code after too many attempts, and a mismatch before expiry", () => {
    const now = 1_700_000_000_000;
    const record = { expiresAtMs: now + CODE_TTL_MS, attempts: 5 };
    assert.equal(evaluateVerify(record, true, now).reason, "locked");
    assert.equal(evaluateVerify({ expiresAtMs: now + CODE_TTL_MS, attempts: 0 }, false, now).reason, "mismatch");
    assert.equal(evaluateVerify(null, true, now).reason, "missing");
  });

  it("enforces a resend cooldown", () => {
    const now = 1_700_000_000_000;
    assert.equal(canResend({ lastSentAtMs: now }, now + 59_000), false);
    assert.equal(canResend({ lastSentAtMs: now }, now + 60_000), true);
  });

  it("generates a 6-digit code", () => {
    const code = generateSixDigitCode();
    assert.equal(isValidSixDigitCode(code), true);
    assert.equal(code.length, 6);
  });

  it("requires a signup password of 6 to 200 characters", () => {
    assert.equal(MIN_SIGNUP_PASSWORD_LENGTH, 6);
    assert.equal(MAX_SIGNUP_PASSWORD_LENGTH, 200);
    assert.equal(isValidSignupPassword("12345"), false);
    assert.equal(isValidSignupPassword("123456"), true);
    assert.equal(isValidSignupPassword("x".repeat(200)), true);
    assert.equal(isValidSignupPassword("x".repeat(201)), false);
  });
});
