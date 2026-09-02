"use strict";

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { getApps, initializeApp, deleteApp } = require("firebase-admin/app");
const { ensureApp, db, serverTimestamp } = require("../lib/adminApp");

async function resetApps() {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

describe("replica Admin SDK lazy init", () => {
  after(async () => {
    await resetApps();
  });

  it("uses getApps()/getApp() and falls back to a named app", () => {
    const src = fs.readFileSync(path.join(__dirname, "../lib/adminApp.js"), "utf8");
    assert.match(src, /require\("firebase-admin\/app"\)/);
    assert.match(src, /getApps\(\)/);
    assert.match(src, /try\s*\{[\s\S]*getApp\(\)/);
    assert.match(src, /return existing\[0\]/);
    assert.match(src, /GCLOUD_PROJECT/);
    assert.match(src, /getFirestore\(ensureApp\(\)\)/);
    assert.equal(src.includes("admin.apps.length"), false);
    assert.equal(src.includes("admin.app()"), false);
  });

  it("db() returns a Firestore instance after ensureApp", () => {
    const app = ensureApp();
    const firestore = db();
    assert.ok(app);
    assert.equal(typeof firestore.collection, "function");
    assert.equal(typeof firestore.runTransaction, "function");
    assert.ok(getApps().length >= 1);
    assert.ok(serverTimestamp());
  });

  it("reuses a named app when [DEFAULT] does not exist", async () => {
    await resetApps();
    initializeApp({ projectId: "recompenses-test" }, "firebase-frameworks");
    const app = ensureApp();
    assert.equal(app.name, "firebase-frameworks");
    const firestore = db();
    assert.equal(typeof firestore.collection, "function");
  });
});
