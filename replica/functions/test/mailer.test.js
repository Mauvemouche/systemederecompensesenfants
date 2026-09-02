"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  mailFromAddress,
  mailReplyTo,
  mailTransportOptions,
  DEFAULT_REPLY_TO,
  safeMailErrorSummary,
  logMailFailure,
} = require("../lib/mailer");

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

  it("safeMailErrorSummary includes SMTP code/command/response/message without auth or password", () => {
    process.env.EMAIL_PASSWORD = "smtp-token-secret";
    const summary = safeMailErrorSummary({
      code: "EAUTH",
      command: "AUTH PLAIN",
      response: "535 5.7.8 Error: authentication failed smtp-token-secret",
      responseCode: 535,
      message: "Invalid login: smtp-token-secret",
      auth: { user: "kidsrewardsystem@proton.me", pass: "smtp-token-secret" },
      stack: "Error: secret stack smtp-token-secret",
    });
    assert.equal(summary.code, "EAUTH");
    assert.equal(summary.command, "AUTH PLAIN");
    assert.equal(summary.responseCode, 535);
    assert.equal("auth" in summary, false);
    assert.equal("stack" in summary, false);
    assert.equal(String(summary.response).includes("smtp-token-secret"), false);
    assert.equal(String(summary.message).includes("smtp-token-secret"), false);
    assert.match(String(summary.message), /\[redacted\]/);
    assert.match(String(summary.response), /\[redacted\]/);
  });

  it("logMailFailure writes the safe summary, not the raw error or password", () => {
    process.env.EMAIL_PASSWORD = "smtp-token-secret";
    const logged = [];
    const original = console.error;
    console.error = (...args) => {
      logged.push(args);
    };
    try {
      logMailFailure("requestSignup mail failed", {
        code: "ESOCKET",
        command: "CONN",
        response: "TLS smtp-token-secret",
        message: "wrong version number smtp-token-secret",
        auth: { user: "u", pass: "smtp-token-secret" },
      });
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "requestSignup mail failed");
    const summary = logged[0][1];
    assert.equal(summary.code, "ESOCKET");
    assert.equal(summary.command, "CONN");
    assert.equal("auth" in summary, false);
    const dumped = JSON.stringify(logged);
    assert.equal(dumped.includes("smtp-token-secret"), false);
    assert.equal(dumped.includes("\"pass\""), false);
  });

  it("signup, PIN recovery, and password-reset catch blocks log the safe summary", () => {
    const signupSrc = fs.readFileSync(path.join(__dirname, "../signup.js"), "utf8");
    const pinSrc = fs.readFileSync(path.join(__dirname, "../adminPin.js"), "utf8");
    const resetSrc = fs.readFileSync(path.join(__dirname, "../passwordReset.js"), "utf8");
    assert.match(signupSrc, /logMailFailure\("requestSignup mail failed"/);
    assert.match(pinSrc, /logMailFailure\("recoverAdminPin mail failed"/);
    assert.match(resetSrc, /logMailFailure\("requestPasswordReset mail failed"/);
    assert.equal(/console\.error\("requestSignup mail failed"\)/.test(signupSrc), false);
    assert.equal(/console\.error\("recoverAdminPin mail failed"\)/.test(pinSrc), false);
    assert.equal(/console\.error\("requestPasswordReset mail failed"\)/.test(resetSrc), false);
  });
});
