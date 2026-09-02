# Replica multi-family platform

Paid copy of the family rewards app. **One Hosting URL per Firebase project, many families.** Login + Auth claim `familyId` selects `families/{familyId}/`.

| | Firebase project | Public URL | Deploy |
| --- | --- | --- | --- |
| Test | `recompenses-test` (default alias) | https://recompenses-test.web.app | `firebase deploy --project recompenses-test` |
| Live paid | `kidsrewardsystem` (`prod` alias) | https://kidsrewardsystem.com | `firebase deploy --project kidsrewardsystem` |

Region stays **europe-west1**. The same `replica/public` folder is deployed to both hostings. `public/js/firebase-config.js` picks TEST vs PROD from the hostname (`kidsrewardsystem.com`, `www.kidsrewardsystem.com`, `kidsrewardsystem.web.app`, `kidsrewardsystem.firebaseapp.com` → live; everything else including `recompenses-test.web.app` → test).

Do **not** create a new Firebase project per paying family. **Never** deploy this onto `systemederecompensesenfants` / `systemederecompensesenfants.web.app` (Florent & Harry). That is a different product.

Mail and operator secrets already exist on `kidsrewardsystem` (copied from test). **Never** put `sk_live` / `whsec` / operator street values in git.

See the root README for Stripe price IDs, secrets, and the provision command.

## Cloud Functions generation (why 2nd gen)

Replica functions are **2nd gen** (Cloud Run). They run as the **Compute Engine default** service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`), which exists on a new Firebase/GCP project.

**1st gen** (`firebase-functions/v1`) runs as `PROJECT_ID@appspot.gserviceaccount.com` (the App Engine default SA). Secret Manager IAM during `firebase deploy` targets that account. On some new projects (including `recompenses-test`) that SA **does not exist**: `gcloud app create` can say the App Engine app already exists while `gcloud app describe` says it does not. Do not fight App Engine — use 2nd gen.

## Deploy (Windows-friendly)

**Stripe by project**

- `recompenses-test`: AnthonyRsca **sandbox** only (`sk_test` / test `whsec`). Live keys are rejected. Hardcoded sandbox price IDs stay as fallback.
- `kidsrewardsystem`: AnthonyRsca **LIVE** keys + live price IDs via Secret Manager (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`). Checkout prefers `process.env.STRIPE_PRICE_*`. **Never copy `sk_test` onto `kidsrewardsystem`.** Do not invent live price IDs in source or git.

Set live Stripe secrets on that project only (CLI prompts; never paste values into git):

```bat
firebase functions:secrets:set STRIPE_SECRET_KEY --project kidsrewardsystem
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project kidsrewardsystem
firebase functions:secrets:set STRIPE_PRICE_MONTHLY --project kidsrewardsystem
firebase functions:secrets:set STRIPE_PRICE_YEARLY --project kidsrewardsystem
```

On test, create the same **price** secret names (sandbox IDs) so deploy can bind them; values may match the hardcoded fallbacks. Do not put live secrets in this README.

Mail and operator identity live in **Google Secret Manager** (Firebase `defineSecret`). They survive `firebase deploy --only functions`. Do **not** set them with `gcloud run services update --update-env-vars` — those Cloud Run env vars are wiped on every functions deploy.

### One-time: create/set secrets (project `recompenses-test`, functions region `europe-west1`)

From the `replica/` folder. The CLI prompts for the value; **never** put real values in git or in this README.

On **live** `kidsrewardsystem`, mail/operator secrets are already copied from test. Stripe there uses AnthonyRsca LIVE keys + live price IDs via Secret Manager (commands above). Never copy `sk_test` onto `kidsrewardsystem`. Repeat `firebase functions:secrets:set … --project kidsrewardsystem` only if a secret is missing. Do not write those values here.

```bat
firebase functions:secrets:set EMAIL_USER --project recompenses-test
firebase functions:secrets:set EMAIL_PASSWORD --project recompenses-test
firebase functions:secrets:set EMAIL_FROM --project recompenses-test
firebase functions:secrets:set EMAIL_REPLY_TO --project recompenses-test
firebase functions:secrets:set EMAIL_SMTP_HOST --project recompenses-test
firebase functions:secrets:set EMAIL_SMTP_PORT --project recompenses-test
firebase functions:secrets:set OPERATOR_LEGAL_NAME --project recompenses-test
firebase functions:secrets:set OPERATOR_STREET_ADDRESS --project recompenses-test
```

Same names with `gcloud` (placeholders only — replace the echoed text with the real value, do not commit it):

```bat
echo YOUR_EMAIL_USER | gcloud secrets create EMAIL_USER --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_SMTP_TOKEN | gcloud secrets create EMAIL_PASSWORD --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_EMAIL_FROM | gcloud secrets create EMAIL_FROM --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_EMAIL_REPLY_TO | gcloud secrets create EMAIL_REPLY_TO --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_SMTP_HOST | gcloud secrets create EMAIL_SMTP_HOST --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_SMTP_PORT | gcloud secrets create EMAIL_SMTP_PORT --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_LEGAL_NAME | gcloud secrets create OPERATOR_LEGAL_NAME --data-file=- --project=recompenses-test --replication-policy=automatic
echo YOUR_STREET_ADDRESS | gcloud secrets create OPERATOR_STREET_ADDRESS --data-file=- --project=recompenses-test --replication-policy=automatic
```

If the secret **already exists**, add a version instead of `create`:

```bat
echo YOUR_SMTP_TOKEN | gcloud secrets versions add EMAIL_PASSWORD --data-file=- --project=recompenses-test
```

Typical mail values (do not paste tokens here): `EMAIL_FROM` / `EMAIL_USER` = `contact@kidsrewardsystem.com` (custom-domain From), `EMAIL_SMTP_HOST` = `smtp.protonmail.ch`, `EMAIL_SMTP_PORT` = `587`. Leave `EMAIL_SMTP_HOST` unset (or empty) to keep the Gmail `service: "gmail"` fallback.

Create the secret **resource** once even if the value is still empty/placeholder, so `firebase deploy --only functions` can bind it. An empty value at runtime does **not** crash the container: signup/PIN/reset return `EMAIL_NOT_CONFIGURED`, and daily mail is skipped. Do not call `SecretParam.value()` at module load.

After this one-time set, later `firebase deploy --only functions` remounts the same secrets. No `gcloud run services update --update-env-vars` after each deploy.

If deploy **400s** with `Secret environment variable overlaps non secret environment variable: EMAIL_USER` (or `OPERATOR_LEGAL_NAME` on `getOperatorLegalIdentity`), leftover plain Cloud Run env vars from the old `--update-env-vars` workaround are still on the service. Remove those env vars first, then `firebase deploy --only functions` again. Do not paste secret values into these commands.

```bat
gcloud run services update requestsignup --project=recompenses-test --region=europe-west1 --remove-env-vars=EMAIL_USER,EMAIL_PASSWORD,EMAIL_FROM,EMAIL_REPLY_TO,EMAIL_SMTP_HOST
gcloud run services update recoveradminpin --project=recompenses-test --region=europe-west1 --remove-env-vars=EMAIL_USER,EMAIL_PASSWORD,EMAIL_FROM,EMAIL_REPLY_TO,EMAIL_SMTP_HOST
gcloud run services update requestpasswordreset --project=recompenses-test --region=europe-west1 --remove-env-vars=EMAIL_USER,EMAIL_PASSWORD,EMAIL_FROM,EMAIL_REPLY_TO,EMAIL_SMTP_HOST
gcloud run services update getoperatorlegalidentity --project=recompenses-test --region=europe-west1 --remove-env-vars=OPERATOR_LEGAL_NAME,OPERATOR_STREET_ADDRESS
firebase deploy --only functions --project recompenses-test
```

```bat
npm --prefix functions install
node scripts/deploy.js
```

Live paid project (same folder, different `--project`):

```bat
node scripts/deploy.js --project kidsrewardsystem
```

`replica/.firebaserc` default stays `recompenses-test`, so a bare `firebase deploy` / `node scripts/deploy.js` still hits test. Use `--project kidsrewardsystem` (or `firebase deploy --project prod`) for https://kidsrewardsystem.com. **Never** `--project systemederecompensesenfants`.

Deploy **functions + hosting + firestore:rules**. Claims and per-family paths need both.

`scripts/deploy.js` and `scripts/deploy.cmd` set `FUNCTIONS_DISCOVERY_TIMEOUT=60` so the Firebase CLI does not die after 10s while loading functions (`User code failed to load. Cannot determine backend specification. Timeout after 10000`).

Runtime: Node **22**, region **europe-west1**. After deploy, register the Stripe sandbox webhook on the printed `stripeWebhook` URL (Cloud Functions URL or Cloud Run URL).

Signup verification (`requestSignup`), Admin PIN recovery (`recoverAdminPin`), password reset (`requestPasswordReset`), and daily summary mail (`dailyResetAndStats`) bind the EMAIL_* secrets. Other functions do not. If `EMAIL_USER` / `EMAIL_PASSWORD` are empty at runtime, those callables return a localized error (or the cron skips mail) instead of sending.

`EMAIL_FROM` is the SMTP From (bare address on Proton). `EMAIL_REPLY_TO` falls back to `EMAIL_FROM`, then `contact@kidsrewardsystem.com`. SMTP auth stays `EMAIL_USER` / `EMAIL_PASSWORD`. If `EMAIL_SMTP_HOST` is set (e.g. `smtp.protonmail.ch`), mail goes over STARTTLS on `EMAIL_SMTP_PORT` or 587 with a bare From (no display-name); Proton SMTP tokens need a paid plan and a custom-domain From, not `@proton.me`. If the host is unset, Gmail `service: "gmail"` is used with a display-name From. Failed sends log a safe SMTP summary (no token).

Languages: **nl, fr, de, en** (Dutch first). Unknown locale and default mail locale: **nl**.

## Legal identity (paid families only)

Never commit a real name or street address.

Public surfaces (gate, signup, `privacy.html`, `terms.html`, emails, visitors, trial, unpaid) show **`contact@kidsrewardsystem.com`** as Contact. `kidsrewardsystem@proton.me` may appear as a secondary complaints address. Do not put “un papa belge” under Contact. Home footer still uses the Belgian-father line separately.

After **that family’s first Stripe invoice with `amount_paid > 0`**, the logged-in app can show the operator name and street. Set these **once** in Secret Manager (commands above) on `getOperatorLegalIdentity` — not as Cloud Run env vars. Optional extra fields in Firestore `platform/legal_identity` (Admin SDK only — clients cannot read it): `OPERATOR_POSTCODE_CITY`, `OPERATOR_COUNTRY`, `OPERATOR_BCE_KBO`, `OPERATOR_VAT`.

Do **not** put real values in git, locale JSON, or `replica/public`. Trial checkout and founder/promo with no charge do not reveal the address. Replica hosting has **no** Firebase Analytics / gtag / cookie banner.

## Stripe promo / founder codes (sandbox only)

Do **not** invent live coupons. Anthony creates them in the **AnthonyRsca Stripe sandbox** Dashboard:

1. **Coupons** — percent or amount off, and a duration.
2. **Promotion codes** — the customer-facing code typed on the Stripe Checkout page.

Checkout Sessions set `allow_promotion_codes` and `payment_method_collection: always`, so monthly/yearly trial checkout collects a card (not charged until the trial ends). A 100% forever coupon may still be 0 € — Stripe still collects a card when `always` allows it.

| Coupon | Meaning |
| --- | --- |
| 100% off, duration **forever** | Founder gift: that family uses the app free forever (including future improvements). After checkout they see a localized success message. |
| Percent or amount off, duration **repeating** or **once** | Later promos (launch, seasonal, etc.). |

Usual prices stay 2,50 €/mois or 25 €/an. Stripe customer/subscription metadata still includes `familyId`.

