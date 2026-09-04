"use strict";

const crypto = require("crypto");

function isFourDigitPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}

function generateFourDigitPin() {
  return String(crypto.randomInt(0, 10_000)).padStart(4, "0");
}

function createAdminToken(familyId, uid, pinHash, now = Date.now()) {
  const exp = now + 2 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ familyId, uid, exp }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", String(pinHash)).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function adminTokenValid(token, familyId, uid, pinHash, now = Date.now()) {
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (_) {
    return false;
  }
  if (data.familyId !== familyId || data.uid !== uid) return false;
  if (!data.exp || now > Number(data.exp)) return false;
  const expected = crypto.createHmac("sha256", String(pinHash)).update(payload).digest("hex");
  const left = Buffer.from(sig, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  isFourDigitPin,
  generateFourDigitPin,
  createAdminToken,
  adminTokenValid,
};
