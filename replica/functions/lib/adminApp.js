"use strict";

const { getApps, initializeApp, getApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

let loggedApps = false;

/** Init only when a function runs — not during `firebase deploy` discovery. */
function ensureApp() {
  const existing = getApps();
  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

  if (!loggedApps) {
    loggedApps = true;
    console.log("[adminApp] existing apps", existing.map((a) => a.name), "GCLOUD_PROJECT", projectId || "");
  }

  if (existing.length > 0) {
    try {
      return getApp();
    } catch (_) {
      return existing[0];
    }
  }

  return initializeApp(projectId ? { projectId } : undefined);
}

function db() {
  return getFirestore(ensureApp());
}

function serverTimestamp() {
  ensureApp();
  return FieldValue.serverTimestamp();
}

module.exports = { ensureApp, db, serverTimestamp, FieldValue };
