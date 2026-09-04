"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { hashSecret, verifySecret } = require("../lib/secretHash");

describe("secretHash", () => {
  it("never stores a hash equal to the raw PIN", () => {
    const pin = "1571";
    const hash = hashSecret(pin);
    assert.notEqual(hash, pin);
    assert.equal(hash.includes(pin), false);
    assert.match(hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.equal(verifySecret(pin, hash), true);
    assert.equal(verifySecret("0000", hash), false);
    assert.equal(verifySecret(pin, hashSecret(pin)), true);
  });

  it("never stores a hash equal to the raw email code", () => {
    const code = "482910";
    const hash = hashSecret(code);
    assert.notEqual(hash, code);
    assert.equal(hash.includes(code), false);
    assert.equal(verifySecret(code, hash), true);
  });
});
