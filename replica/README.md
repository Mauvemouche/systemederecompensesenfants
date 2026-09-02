# Replica instance template

Paid copy of the family rewards app. Deploy this folder to a **new** Firebase project with its own Firestore.

Do not deploy this onto `systemederecompensesenfants.web.app`.

See the root README for Stripe price IDs, secrets, and the provision command.

## Deploy (Windows-friendly)

Required secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (sandbox `sk_test` / `whsec` only).

Email secrets (`EMAIL_USER`, `EMAIL_PASSWORD`) are **optional**. The daily cron deploys without them.

```bat
npm --prefix functions install
node scripts/deploy.js
```

`scripts/deploy.js` and `scripts/deploy.cmd` set `FUNCTIONS_DISCOVERY_TIMEOUT=60` so the Firebase CLI does not die after 10s while loading functions (`User code failed to load. Cannot determine backend specification. Timeout after 10000`).

Runtime: Node **22**.
