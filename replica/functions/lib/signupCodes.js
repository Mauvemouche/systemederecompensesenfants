"use strict";

const crypto = require("crypto");

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function isValidSignupPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 200;
}

function emailDocId(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function isValidSixDigitCode(code) {
  return /^\d{6}$/.test(String(code || ""));
}

function isCodeExpired(record, now = Date.now()) {
  const exp = Number(record?.expiresAtMs);
  if (!Number.isFinite(exp) || exp <= 0) return true;
  return now >= exp;
}

function canResend(record, now = Date.now()) {
  const last = Number(record?.lastSentAtMs);
  if (!Number.isFinite(last) || last <= 0) return true;
  return now - last >= RESEND_COOLDOWN_MS;
}

function tooManyAttempts(record) {
  return Number(record?.attempts || 0) >= MAX_ATTEMPTS;
}

function nextExpiry(now = Date.now()) {
  return now + CODE_TTL_MS;
}

function evaluateVerify(record, codeMatches, now = Date.now()) {
  if (!record) return { ok: false, reason: "missing" };
  if (isCodeExpired(record, now)) return { ok: false, reason: "expired" };
  if (tooManyAttempts(record)) return { ok: false, reason: "locked" };
  if (!codeMatches) return { ok: false, reason: "mismatch" };
  return { ok: true, reason: "ok" };
}

module.exports = {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  normalizeEmail,
  isValidEmail,
  isValidSignupPassword,
  emailDocId,
  generateSixDigitCode,
  isValidSixDigitCode,
  isCodeExpired,
  canResend,
  tooManyAttempts,
  nextExpiry,
  evaluateVerify,
};
