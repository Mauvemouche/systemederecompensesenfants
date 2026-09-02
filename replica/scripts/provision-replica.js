#!/usr/bin/env node
"use strict";

/**
 * Point replica/ at the multi-family platform Firebase project.
 *
 * Paying families share ONE Hosting URL. Login + Auth claim `familyId`
 * selects families/{familyId} in Firestore. Do NOT create a new Firebase
 * project per client (that is the old single-tenant trap).
 *
 * Usage:
 *   node replica/scripts/provision-replica.js --project recompenses-test
 */
const fs = require("fs");
const path = require("path");

const FORBIDDEN = new Set(["systemederecompensesenfants", "systemederecompensesenfantsqa"]);
const PLATFORM_PROJECT = "recompenses-test";
const replicaRoot = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const projectId = arg("--project") || process.env.REPLICA_PROJECT_ID || PLATFORM_PROJECT;
if (!projectId) {
  console.error("Missing --project (use recompenses-test for the multi-family platform)");
  process.exit(1);
}
if (FORBIDDEN.has(projectId)) {
  console.error("Refusing to provision on Anthony's live/QA family project:", projectId);
  console.error("The paid platform is a separate Firebase project (recompenses-test), one URL for all families.");
  process.exit(1);
}

if (projectId !== PLATFORM_PROJECT) {
  console.warn("");
  console.warn("WARNING: this repo's replica/ IS the multi-family platform.");
  console.warn(`A new Firebase project (${projectId}) is another single-tenant trap.`);
  console.warn(`Use --project ${PLATFORM_PROJECT} so every paying family shares https://recompenses-test.web.app`);
  console.warn("and lives under families/{familyId}/ in that project's Firestore.");
  console.warn("");
}

const firebaserc = {
  projects: { default: projectId },
};
fs.writeFileSync(path.join(replicaRoot, ".firebaserc"), JSON.stringify(firebaserc, null, 2) + "\n");

console.log(`Wrote replica/.firebaserc for project ${projectId}`);
console.log(`
This project is the multi-family platform (not one Firebase app per client).

- Hosting: https://${projectId}.web.app
- Each signup+checkout creates families/{familyId}/ (settings, tasks, billing, users)
- Auth custom claim familyId is set by Cloud Functions only
- Firestore rules: client can only access families/{familyId}/** when token.familyId matches
- Root billing/current and family_config/settings are legacy singletons (migrated, not used for new families)

Next steps (Anthony — do not deploy this onto systemederecompensesenfants.web.app):

1. Keep using Firebase project ${projectId}. Do not spin up a second live-style project for client #2.
2. Enable Authentication (Email/Password), Firestore, Hosting, and Cloud Functions (2nd gen, Node 22, europe-west1).
3. Web app config lives in replica/public/js/firebase-config.js (deployed instance, not the live Florent/Harry app).
4. Sandbox Stripe secrets (never sk_live):
     firebase functions:secrets:set STRIPE_SECRET_KEY --project ${projectId}
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project ${projectId}
   Mail + operator identity (once; Secret Manager, not Cloud Run env vars):
     firebase functions:secrets:set EMAIL_USER --project ${projectId}
     firebase functions:secrets:set EMAIL_PASSWORD --project ${projectId}
     firebase functions:secrets:set EMAIL_FROM --project ${projectId}
     firebase functions:secrets:set EMAIL_REPLY_TO --project ${projectId}
     firebase functions:secrets:set EMAIL_SMTP_HOST --project ${projectId}
     firebase functions:secrets:set EMAIL_SMTP_PORT --project ${projectId}
     firebase functions:secrets:set OPERATOR_LEGAL_NAME --project ${projectId}
     firebase functions:secrets:set OPERATOR_STREET_ADDRESS --project ${projectId}
   After that, do not use gcloud run services update --update-env-vars after each deploy.
   Prices already exist in AnthonyRsca sandbox:
     monthly price_1UAzwjA8Dakj1Sdel8QCE7II (2.50 EUR)
     yearly  price_1UAzx0A8Dakj1SdePoaupmpE (25 EUR)
5. From the replica/ folder:
     npm --prefix functions install
     node scripts/deploy.js
   Deploy both functions and hosting (rules + claims + UI).
6. Stripe sandbox webhook on stripeWebhook:
     checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed
7. Enable Customer Portal in the Stripe sandbox Dashboard.
8. Two parents sign up on the SAME URL. Each gets an isolated family (kids/tasks do not mix).
   The existing owner (anthony.rsca@gmail.com) is migrated into families/{id} on next login.

Production family app is unchanged: public/ → https://systemederecompensesenfants.web.app/
`);
