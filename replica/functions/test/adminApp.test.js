"use strict";

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { getApps, deleteApp } = require("firebase-admin/app");
const { ensureApp, db, serverTimestamp } = require("../lib/adminApp");

describe("replica Admin SDK lazy init", () => {
  after(async () => {
    await Promise.all(getApps().map((app) => deleteApp(app)));
  });

  it("uses getApps()/getApp() instead of admin.apps.length", () => {
    const src = fs.readFileSync(path.join(__dirname, "../lib/adminApp.js"), "utf8");
    assert.match(src, /require\("firebase-admin\/app"\)/);
    assert.match(src, /getApps\(\)\.length === 0/);
    assert.match(src, /initializeApp\(\)/);
    assert.match(src, /return getApp\(\)/);
    assert.match(src, /getFirestore\(\)/);
    assert.match(src, /FieldValue/);
    assert.equal(src.includes("admin.apps.length"), false);
    assert.equal(src.includes("admin.app()"), false);
    assert.equal(src.includes("admin.initializeApp()"), false);
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
});
