"use strict";

const admin = require("firebase-admin");

/** Init only when a function runs — not during `firebase deploy` discovery. */
function ensureApp() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.app();
}

function db() {
  ensureApp();
  return admin.firestore();
}

module.exports = { admin, ensureApp, db };
