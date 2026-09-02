# Système de récompenses enfants

Two products live in this repo. They are **not** a shared database.

## 1. Anthony's family app (production — leave as-is)

- Code: `public/` + root `functions/` + root `firestore.rules`
- Live: https://systemederecompensesenfants.web.app/
- Kids: Florent & Harry (hardcoded)
- Database: this Firebase project's default Firestore
- No signup, no Stripe, no other families

Do **not** migrate this data, grandfather it into a household schema, or point other families at it. Production hosting deploys stay Anthony's.

## 2. Paid multi-family platform (replica/)

Other parents share **one Hosting URL** on a **separate Firebase project**. Login decides which family you see. Each family is `families/{familyId}/` (settings, tasks, billing, users). They never log into Anthony's Florent/Harry instance.

- Test: `recompenses-test` → https://recompenses-test.web.app (`replica/.firebaserc` default)
- Live paid: `kidsrewardsystem` → https://kidsrewardsystem.com (`prod` alias). Deploy with `--project kidsrewardsystem`.
- Template / platform: `replica/`
- Same kids/parent UX (tasks, bonus, penalties, screen-time)
- Parent account + Stripe Checkout (sandbox on test; live Stripe keys stay UNSET)
- First month free (`subscription_data.trial_period_days = 30`), then **2.50 EUR/month** or **25 EUR/year**
- Auth custom claim `familyId` (Cloud Functions only)
- Test defaults: **Kid 1** and **Kid 2** (not Florent & Harry). Names are per family (`renamePerson`).
- `replica/public/js/firebase-config.js` switches TEST/PROD by hostname (same `public/` folder).

Do **not** create a new Firebase project per paying family. That is the old single-tenant trap (`billing/current` one owner, second parent blocked). **Never** deploy `replica/` onto `systemederecompensesenfants`.

### Stripe (sandbox / AnthonyRsca test mode only)

Already created (`livemode: false`):

| | ID |
|---|---|
| Product | `prod_VBMgh23YU5Q2RB` |
| Monthly | `price_1UAzwjA8Dakj1Sdel8QCE7II` (`family_monthly`, 2.50 EUR) |
| Yearly | `price_1UAzx0A8Dakj1SdePoaupmpE` (`family_yearly`, 25 EUR) |

Never create live products, live prices, or live charges. Never commit `sk_live` / `sk_test` secret keys. Checkout session + Stripe customer/subscription metadata include `familyId`.

### What Anthony must set for the platform project

1. **One Firebase project per environment** for all paying families (`recompenses-test` test, `kidsrewardsystem` live — not `systemederecompensesenfants`).
2. `replica/public/js/firebase-config.js` — hostname switch (TEST vs PROD web config). Tracked; a pull must not wipe it back to placeholders.
3. `replica/.firebaserc` — tracked aliases: default `recompenses-test`, prod `kidsrewardsystem`.
4. Cloud Functions secrets (sandbox):
   - `STRIPE_SECRET_KEY` (`sk_test_…` only)
   - `STRIPE_WEBHOOK_SECRET` (`whsec_…`)
   - Optional only: `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_TO` for the daily report email.
     **Do not set these to deploy.** The 06:00 cron runs without them (reset/stats only).
   - Optional: `RESET_NOTIFICATION_EMAIL` in `replica/public/js/firebase-config.js` (same role as `EMAIL_TO`; no personal default)
5. Stripe Customer Portal enabled in the **sandbox** Dashboard.
6. Webhook endpoint on **that** project's function URL (see script output).

See `replica/env.example` for names. Copy values locally; do not commit them.

### Provision the platform (not a new project per family)

```bash
node replica/scripts/provision-replica.js --project recompenses-test
```

The script refuses Anthony's live/QA project IDs and warns if you pass a different project (that would recreate the single-tenant trap). Deploy **from `replica/`**, not from the repo root:

```bash
cd replica
npm --prefix functions install
node scripts/deploy.js
```

On Windows PowerShell, if `firebase deploy` dies with `Timeout after 10000` / `Cannot determine backend specification`:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"
firebase deploy
```

Replica functions are **2nd gen** (Cloud Run / Compute default SA). They do **not** need `PROJECT@appspot.gserviceaccount.com`. 1st gen does — do not use 1st gen on a project where that App Engine SA is missing.

Or run `replica/scripts/deploy.cmd`. Deploying from the repo root still only targets Anthony's `public/` + `public-qa/` hosting — replica hosting is **not** wired into root `firebase.json` on purpose.

### QA path (same URL, isolated families)

1. Open https://recompenses-test.web.app (not the live Florent & Harry site).
2. Parent A signs up, completes sandbox Checkout (30-day trial), sees Kid 1 / Kid 2 (or renamed names).
3. Parent B signs up on the **same URL**, completes Checkout, sees a different family.
4. Tasks live under `families/{familyId}/tasks`. They must not appear in the other parent's board.
5. Existing test owner `anthony.rsca@gmail.com` is migrated from the old singleton `billing/current` + root `tasks` into `families/{id}` on next login.

Automated checks: `npm test` in `replica/functions` (Checkout payload, sandbox key guard, family isolation helpers, production app left untouched).

## Deploying Anthony's own app

Still Anthony's job. From the repo root, the existing Firebase Hosting targets `prod` / `qa` are unchanged. This PR does not deploy to production.
