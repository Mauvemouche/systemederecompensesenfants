"use strict";

const { getApps, initializeApp, getApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/** Init only when a function runs — not during `firebase deploy` discovery. */
function ensureApp() {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getApp();
}

function db() {
  ensureApp();
  return getFirestore();
}

function serverTimestamp() {
  ensureApp();
  return FieldValue.serverTimestamp();
}

module.exports = { ensureApp, db, serverTimestamp, FieldValue };
