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

Signup verification and Admin PIN recovery also use `EMAIL_USER` / `EMAIL_PASSWORD` at runtime. They are **not** bound with `defineSecret`, so deploy still works if they are missing. If they are unset, the callables return a localized error instead of sending mail. To actually send mail, set those env vars (or mount the existing secrets) on the Cloud Run services for `requestSignup`, `verifyEmailCode`, and `recoverAdminPin`.

Languages: **nl, fr, de, en** (Dutch first). Unknown locale and default mail locale: **nl**.

## Legal identity (paid families only)

Never commit a real name or street address.

Public surfaces (gate, signup, `privacy.html`, `terms.html`, emails, visitors, trial, unpaid, 100% forever promo) show only `kidsrewardsystem@proton.me` and optionally “a Belgian father”.

After **that family’s first Stripe invoice with `amount_paid > 0`**, the logged-in app can show the operator name and street. Set these on the Cloud Run services for `getOperatorLegalIdentity` (or in Firestore `platform/legal_identity`, Admin SDK only — clients cannot read it):

```
OPERATOR_LEGAL_NAME
OPERATOR_STREET_ADDRESS
```

Optional: `OPERATOR_POSTCODE_CITY`, `OPERATOR_COUNTRY`, `OPERATOR_BCE_KBO`, `OPERATOR_VAT`.

Do **not** put real values in git, locale JSON, or `replica/public`. Trial checkout and founder/promo with no charge do not reveal the address. Replica hosting has **no** Firebase Analytics / gtag / cookie banner.

## Stripe promo / founder codes (sandbox only)

Do **not** invent live coupons. Anthony creates them in the **AnthonyRsca Stripe sandbox** Dashboard:

1. **Coupons** — percent or amount off, and a duration.
2. **Promotion codes** — the customer-facing code typed on the Stripe Checkout page.

Checkout Sessions set `allow_promotion_codes` and `payment_method_collection: if_required`, so a 100% forever coupon does not demand a card.

| Coupon | Meaning |
| --- | --- |
| 100% off, duration **forever** | Founder gift: that family uses the app free forever (including future improvements). After checkout they see a localized success message. |
| Percent or amount off, duration **repeating** or **once** | Later promos (launch, seasonal, etc.). |

Usual prices stay 2,50 €/mois or 25 €/an. Stripe customer/subscription metadata still includes `familyId`.

