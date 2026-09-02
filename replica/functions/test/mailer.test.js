"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mailFromAddress, mailReplyTo, mailTransportOptions, DEFAULT_REPLY_TO } = require("../lib/mailer");

const repoRoot = path.join(__dirname, "..", "..", "..");
const EMAIL_ENV_KEYS = [
  "EMAIL_USER",
  "EMAIL_PASSWORD",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_PORT",
];

describe("mailer From and Reply-To", () => {
  const saved = {};

  beforeEach(() => {
    for (const key of EMAIL_ENV_KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of EMAIL_ENV_KEYS) {
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
    assert.equal(mailReplyTo(), "kidsrewardsystem@proton.me");

    process.env.EMAIL_FROM = "from-alias@example.com";
    delete process.env.EMAIL_REPLY_TO;
    assert.equal(mailReplyTo(), "from-alias@example.com");

    process.env.EMAIL_REPLY_TO = "other@example.com";
    assert.equal(mailReplyTo(), "other@example.com");
  });

  it("uses Gmail transport when EMAIL_SMTP_HOST is unset", () => {
    process.env.EMAIL_USER = "gmail-smtp@gmail.com";
    process.env.EMAIL_PASSWORD = "app-password";
    delete process.env.EMAIL_SMTP_HOST;
    delete process.env.EMAIL_SMTP_PORT;
    assert.deepEqual(mailTransportOptions(), {
      service: "gmail",
      auth: { user: "gmail-smtp@gmail.com", pass: "app-password" },
    });
  });

  it("uses Proton STARTTLS transport when EMAIL_SMTP_HOST is smtp.protonmail.ch", () => {
    process.env.EMAIL_USER = "smtp-user@example.com";
    process.env.EMAIL_PASSWORD = "smtp-token";
    process.env.EMAIL_SMTP_HOST = "smtp.protonmail.ch";
    delete process.env.EMAIL_SMTP_PORT;
    assert.deepEqual(mailTransportOptions(), {
      host: "smtp.protonmail.ch",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "smtp-user@example.com", pass: "smtp-token" },
    });

    process.env.EMAIL_SMTP_PORT = "465";
    assert.equal(mailTransportOptions().port, 465);
    assert.equal(mailTransportOptions().secure, false);
    assert.equal(mailTransportOptions().requireTLS, true);
  });

  it("documents Gmail Send mail as, Proton paid-plan SMTP, and does not log credentials", () => {
    const src = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/mailer.js"), "utf8");
    assert.match(src, /Send mail as/);
    assert.match(src, /paid plan \+ custom domain/);
    assert.match(src, /not @proton\.me/);
    assert.match(src, /mailFromAddress\(\)/);
    assert.match(src, /mailReplyTo\(\)/);
    assert.match(src, /mailTransportOptions\(\)/);
    assert.match(src, /replyTo:/);
    assert.equal(/console\.(log|info|debug|error).*EMAIL_PASSWORD/.test(src), false);
    assert.equal(/console\.(log|info|debug).*EMAIL_USER/.test(src), false);
    assert.equal(src.includes("service: \"gmail\""), true);
    assert.equal(src.includes("requireTLS: true"), true);
  });
});
