# Replica multi-family platform

Paid copy of the family rewards app. **One Firebase project, one Hosting URL, many families.**

Deploy this folder to `recompenses-test` (https://recompenses-test.web.app). Login + Auth claim `familyId` selects `families/{familyId}/`.

Do **not** create a new Firebase project per paying family. Do not deploy this onto `systemederecompensesenfants.web.app`.

See the root README for Stripe price IDs, secrets, and the provision command.

## Cloud Functions generation (why 2nd gen)

Replica functions are **2nd gen** (Cloud Run). They run as the **Compute Engine default** service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`), which exists on a new Firebase/GCP project.

**1st gen** (`firebase-functions/v1`) runs as `PROJECT_ID@appspot.gserviceaccount.com` (the App Engine default SA). Secret Manager IAM during `firebase deploy` targets that account. On some new projects (including `recompenses-test`) that SA **does not exist**: `gcloud app create` can say the App Engine app already exists while `gcloud app describe` says it does not. Do not fight App Engine — use 2nd gen.

## Deploy (Windows-friendly)

Required secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (sandbox `sk_test` / `whsec` only).

Email secrets (`EMAIL_USER`, `EMAIL_PASSWORD`) are **optional**. The daily cron deploys without them.

```bat
npm --prefix functions install
node scripts/deploy.js
```

Deploy **functions + hosting + firestore:rules**. Claims and per-family paths need both.

`scripts/deploy.js` and `scripts/deploy.cmd` set `FUNCTIONS_DISCOVERY_TIMEOUT=60` so the Firebase CLI does not die after 10s while loading functions (`User code failed to load. Cannot determine backend specification. Timeout after 10000`).

Runtime: Node **22**, region **europe-west1**. After deploy, register the Stripe sandbox webhook on the printed `stripeWebhook` URL (Cloud Functions URL or Cloud Run URL).
