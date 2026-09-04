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

describe("createFamilyForOwner does not throw HttpsError inside runTransaction", () => {
  it("locks family_members without HttpsError in the transaction", () => {
    const src = fs.readFileSync(path.join(__dirname, "../lib/families.js"), "utf8");
    const txBlocks = [...src.matchAll(/runTransaction\(async \(tx\) => \{[\s\S]*?\n  \}\)/g)];
    assert.ok(txBlocks.length >= 1, "runTransaction block");
    for (const m of txBlocks) {
      assert.equal(/HttpsError/.test(m[0]), false);
    }
    assert.match(src, /ensureApp/);
  });
});
