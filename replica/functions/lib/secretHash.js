"use strict";

const crypto = require("crypto");

const SCRYPT_KEYLEN = 32;
const SALT_LEN = 16;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashSecret(plain) {
  const value = String(plain ?? "");
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(value, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifySecret(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts[0] !== "scrypt" || parts.length !== 3) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch (_) {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  const key = crypto.scryptSync(String(plain ?? ""), salt, expected.length, SCRYPT_OPTS);
  if (key.length !== expected.length) return false;
  return crypto.timingSafeEqual(key, expected);
}

module.exports = { hashSecret, verifySecret };
