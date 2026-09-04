"use strict";

const { hashSecret, verifySecret } = require("./secretHash");
const {
  isValidSignupPassword,
  isValidSixDigitCode,
  evaluateVerify,
} = require("./signupCodes");

function evaluateConfirmReset({ record, code, password, now = Date.now() }) {
  if (!isValidSignupPassword(password)) return { ok: false, reason: "weak-password" };
  const trimmed = String(code || "").trim();
  if (!isValidSixDigitCode(trimmed)) return { ok: false, reason: "code-required" };
  const matches = !!(record?.codeHash && verifySecret(trimmed, record.codeHash));
  const result = evaluateVerify(record, matches, now);
  if (!result.ok) return result;
  if (!record.uid) return { ok: false, reason: "missing" };
  return { ok: true, reason: "ok", uid: record.uid };
}

async function applyPasswordUpdate(updateUser, uid, password) {
  if (!uid) throw new Error("missing-uid");
  await updateUser(uid, { password });
  return { uid, password };
}

function hashResetCode(code) {
  return hashSecret(code);
}

module.exports = {
  evaluateConfirmReset,
  applyPasswordUpdate,
  hashResetCode,
};
