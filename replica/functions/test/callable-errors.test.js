"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { HttpsError, isHttpsError, rethrowAsHttps, wrapCallable } = require("../lib/callable");

describe("callable error wrapping", () => {
  it("rethrows HttpsError unchanged", () => {
    const denied = new HttpsError("permission-denied", "déjà prise");
    assert.equal(isHttpsError(denied), true);
    assert.throws(() => rethrowAsHttps(denied), (err) => {
      assert.equal(err, denied);
      assert.equal(err.code, "permission-denied");
      return true;
    });
  });

  it("wraps unknown errors as HttpsError internal with the real message", async () => {
    const handler = wrapCallable("bootstrapInstance", async () => {
      throw new Error("7 PERMISSION_DENIED: Missing or insufficient permissions.");
    });
    await assert.rejects(handler({}), (err) => {
      assert.equal(isHttpsError(err), true);
      assert.equal(err.code, "internal");
      assert.match(String(err.message), /PERMISSION_DENIED|insufficient permissions/);
      return true;
    });
  });
});

describe("bootstrapInstance does not throw HttpsError inside runTransaction", () => {
  it("checks ownerUid before/after the transaction", () => {
    const src = fs.readFileSync(path.join(__dirname, "../billing.js"), "utf8");
    const tx = src.match(/runTransaction\(async \(tx\) => \{[\s\S]*?\n    \}\);/);
    assert.ok(tx, "runTransaction block");
    assert.equal(/new HttpsError/.test(tx[0]), false);
    assert.match(src, /ownerConflict/);
    assert.match(src, /ensureApp\(\)/);
    assert.match(src, /serverTimestamp\(\)/);
  });
});
