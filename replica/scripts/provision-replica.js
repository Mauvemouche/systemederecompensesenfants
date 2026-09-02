#!/usr/bin/env node
"use strict";

/**
 * Prepare a NEW family replica instance.
 * Does not deploy, and refuses Anthony's live family project.
 *
 * Usage:
 *   node replica/scripts/provision-replica.js --project family-dupont
 */
const fs = require("fs");
const path = require("path");

const FORBIDDEN = new Set(["systemederecompensesenfants", "systemederecompensesenfantsqa"]);
const replicaRoot = path.join(__dirname, "..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : "";
}

const projectId = arg("--project") || process.env.REPLICA_PROJECT_ID;
if (!projectId) {
  console.error("Missing --project YOUR_REPLICA_PROJECT_ID");
  process.exit(1);
}
if (FORBIDDEN.has(projectId)) {
  console.error("Refusing to provision on Anthony's live/QA family project:", projectId);
  console.error("Create a NEW Firebase project for the paying family.");
  process.exit(1);
}

const firebaserc = {
  projects: { default: projectId },
};
fs.writeFileSync(path.join(replicaRoot, ".firebaserc"), JSON.stringify(firebaserc, null, 2) + "\n");

console.log(`Wrote replica/.firebaserc for project ${projectId}`);
console.log(`
Next steps (Anthony — do not deploy this onto systemederecompensesenfants.web.app):

1. Create a NEW Firebase project named ${projectId} (separate Firestore database).
2. Enable Authentication (Email/Password), Firestore, Hosting, and Functions (Node 22, europe-west1).
3. Register a web app and paste the sdk config into replica/public/js/firebase-config.js
   (replace every YOUR_REPLICA_* placeholder).
4. Set sandbox Stripe secrets (never sk_live). These are required for Checkout:
     firebase functions:secrets:set STRIPE_SECRET_KEY
     firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   Do NOT set EMAIL_USER / EMAIL_PASSWORD unless you want the daily report email.
   The 06:00 cron deploys without those secrets (reset/stats still run; email is skipped).
   Prices already exist in AnthonyRsca sandbox:
     monthly price_1UAzwjA8Dakj1Sdel8QCE7II (2.50 EUR)
     yearly  price_1UAzx0A8Dakj1SdePoaupmpE (25 EUR)
5. From the replica/ folder:
     npm --prefix functions install
     node scripts/deploy.js
   On Windows, if a raw `firebase deploy` fails with
   "Timeout after 10000" / "Cannot determine backend specification":
     set FUNCTIONS_DISCOVERY_TIMEOUT=60
     firebase deploy
   or run scripts\\deploy.cmd
   (CLI default discovery timeout is 10s.)
6. In Stripe sandbox, add a webhook to:
     https://europe-west1-${projectId}.cloudfunctions.net/stripeWebhook
   Events: checkout.session.completed, customer.subscription.created,
           customer.subscription.updated, customer.subscription.deleted,
           invoice.paid, invoice.payment_failed
7. Enable Customer Portal in the Stripe sandbox Dashboard (for « Abonnement »).
8. Send the family their Hosting URL. First parent to sign up owns the instance,
   starts a 30-day trial via Checkout, then names their own children.

Production family app is unchanged: public/ → https://systemederecompensesenfants.web.app/
`);
