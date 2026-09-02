#!/usr/bin/env node
"use strict";

/**
 * Point replica/ at the multi-family platform Firebase projects.
 *
 * Paying families share ONE Hosting URL per project. Login + Auth claim `familyId`
 * selects families/{familyId} in Firestore. Do NOT create a new Firebase
 * project per client (that is the old single-tenant trap).
 *
 * Usage:
 *   node replica/scripts/provision-replica.js --project recompenses-test
 *   node replica/scripts/provision-replica.js --project kidsrewardsystem
 */
const fs = require("fs");
const path = require("path");

const FORBIDDEN = new Set(["systemederecompensesenfants", "systemederecompensesenfantsqa"]);
const TEST_PROJECT = "recompenses-test";
const PROD_PROJECT = "kidsrewardsystem";
const replicaRoot = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const projectId = arg("--project") || process.env.REPLICA_PROJECT_ID || TEST_PROJECT;
if (!projectId) {
  console.error("Missing --project (use recompenses-test or kidsrewardsystem)");
  process.exit(1);
}
if (FORBIDDEN.has(projectId)) {
  console.error("Refusing to provision on Anthony's live/QA family project:", projectId);
  console.error("The paid platform is a separate Firebase project (recompenses-test test, kidsrewardsystem live).");
  console.error("Never deploy replica/ onto systemederecompensesenfants.");
  process.exit(1);
}

if (projectId !== TEST_PROJECT && projectId !== PROD_PROJECT) {
  console.warn("");
  console.warn("WARNING: this repo's replica/ IS the multi-family platform.");
  console.warn(`A new Firebase project (${projectId}) is another single-tenant trap.`);
  console.warn(`Use --project ${TEST_PROJECT} (test) or ${PROD_PROJECT} (live paid).`);
  console.warn("Every paying family shares one URL and lives under families/{familyId}/.");
  console.warn("");
}

const firebaserc = {
  projects: {
    default: TEST_PROJECT,
    prod: PROD_PROJECT,
  },
};
fs.writeFileSync(path.join(replicaRoot, ".firebaserc"), JSON.stringify(firebaserc, null, 2) + "\n");

console.log(`Wrote replica/.firebaserc (default=${TEST_PROJECT}, prod=${PROD_PROJECT})`);
console.log(`Requested project: ${projectId}`);
console.log(`
This project is the multi-family platform (not one Firebase app per client).

- Test hosting: https://${TEST_PROJECT}.web.app
- Live paid hosting: https://kidsrewardsystem.com (project ${PROD_PROJECT})
- Each signup+checkout creates families/{familyId}/ (settings, tasks, billing, users)
- Auth custom claim familyId is set by Cloud Functions only
- Firestore rules: client can only access families/{familyId}/** when token.familyId matches
- Root billing/current and family_config/settings are legacy singletons (migrated, not used for new families)
- replica/public/js/firebase-config.js picks TEST vs PROD from the hostname

Next steps (never deploy this onto systemederecompensesenfants.web.app):

1. Keep using Firebase project ${TEST_PROJECT} (test) or ${PROD_PROJECT} (live paid). Do not spin up a second live-style project for client #2.
2. Enable Authentication (Email/Password), Firestore, Hosting, and Cloud Functions (2nd gen, Node 22, europe-west1).
3. Web app config lives in replica/public/js/firebase-config.js (hostname switch; not the live Florent/Harry app).
4. Sandbox Stripe secrets on ${TEST_PROJECT} (never invent live Stripe keys):
     firebase functions:secrets:set STRIPE_SECRET_KEY --project ${TEST_PROJECT}
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project ${TEST_PROJECT}
   Mail + operator identity already exist on ${PROD_PROJECT} (copied from test). Stripe live keys on ${PROD_PROJECT} stay UNSET.
   After that, do not use gcloud run services update --update-env-vars after each deploy.
   Prices already exist in AnthonyRsca sandbox:
     monthly price_1UAzwjA8Dakj1Sdel8QCE7II (2.50 EUR)
     yearly  price_1UAzx0A8Dakj1SdePoaupmpE (25 EUR)
5. From the replica/ folder:
     npm --prefix functions install
     node scripts/deploy.js --project ${projectId}
   Deploy both functions and hosting (rules + claims + UI). Default alias is ${TEST_PROJECT}; live is --project ${PROD_PROJECT}.
6. Stripe sandbox webhook on stripeWebhook:
     checkout.session.completed, customer.subscription.*, invoice.paid, invoice.payment_failed
7. Enable Customer Portal in the Stripe sandbox Dashboard.
8. Two parents sign up on the SAME URL. Each gets an isolated family (kids/tasks do not mix).
   The existing owner (anthony.rsca@gmail.com) is migrated into families/{id} on next login.

Production family app is unchanged: public/ → https://systemederecompensesenfants.web.app/
`);
