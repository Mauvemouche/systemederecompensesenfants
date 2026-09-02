"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mailFromAddress, mailReplyTo, DEFAULT_REPLY_TO } = require("../lib/mailer");

const repoRoot = path.join(__dirname, "..", "..", "..");

describe("mailer From and Reply-To", () => {
  const saved = {};

  beforeEach(() => {
    for (const key of ["EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_FROM", "EMAIL_REPLY_TO"]) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ["EMAIL_USER", "EMAIL_PASSWORD", "EMAIL_FROM", "EMAIL_REPLY_TO"]) {
      if (saved[key] == null) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("uses EMAIL_FROM when set, otherwise EMAIL_USER, and replies to proton by default", () => {
    process.env.EMAIL_USER = "gmail-smtp@gmail.com";
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
    assert.equal(mailFromAddress(), "gmail-smtp@gmail.com");
    assert.equal(mailReplyTo(), "kidsrewardsystem@proton.me");
    assert.equal(DEFAULT_REPLY_TO, "kidsrewardsystem@proton.me");

    process.env.EMAIL_FROM = "kidsrewardsystem@proton.me";
    assert.equal(mailFromAddress(), "kidsrewardsystem@proton.me");

    process.env.EMAIL_REPLY_TO = "other@example.com";
    assert.equal(mailReplyTo(), "other@example.com");
  });

  it("documents Gmail Send mail as and does not log credentials", () => {
    const src = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/mailer.js"), "utf8");
    assert.match(src, /Send mail as/);
    assert.match(src, /mailFromAddress\(\)/);
    assert.match(src, /mailReplyTo\(\)/);
    assert.match(src, /replyTo:/);
    assert.equal(/console\.(log|info|debug|error).*EMAIL_PASSWORD/.test(src), false);
    assert.equal(/console\.(log|info|debug).*EMAIL_USER/.test(src), false);
    assert.equal(src.includes("service: \"gmail\""), true);
  });
});
