"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { t, localeFromRequest } = require("./i18n");

const REGION = "europe-west1";

/** Bound only on Stripe functions. Live keys only when the Cloud project is kidsrewardsystem. */
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const STRIPE_PRICE_MONTHLY = defineSecret("STRIPE_PRICE_MONTHLY");
const STRIPE_PRICE_YEARLY = defineSecret("STRIPE_PRICE_YEARLY");
const STRIPE_SECRETS = [STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY];

/**
 * Secret Manager names. Bound only on the functions that need them.
 * Do not call .value() at module load (deploy discovery / container boot).
 * Runtime reads process.env[name] the same way the mailer already does.
 * Empty or missing at runtime → EMAIL_NOT_CONFIGURED / public contact only.
 */
const EMAIL_USER = defineSecret("EMAIL_USER");
const EMAIL_PASSWORD = defineSecret("EMAIL_PASSWORD");
const EMAIL_FROM = defineSecret("EMAIL_FROM");
const EMAIL_REPLY_TO = defineSecret("EMAIL_REPLY_TO");
const EMAIL_SMTP_HOST = defineSecret("EMAIL_SMTP_HOST");
const EMAIL_SMTP_PORT = defineSecret("EMAIL_SMTP_PORT");
const OPERATOR_LEGAL_NAME = defineSecret("OPERATOR_LEGAL_NAME");
const OPERATOR_STREET_ADDRESS = defineSecret("OPERATOR_STREET_ADDRESS");

const EMAIL_SECRETS = [
  EMAIL_USER,
  EMAIL_PASSWORD,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  EMAIL_SMTP_HOST,
  EMAIL_SMTP_PORT,
];
const OPERATOR_SECRETS = [OPERATOR_LEGAL_NAME, OPERATOR_STREET_ADDRESS];

const CALLABLE = { region: REGION };
const CALLABLE_MAIL = { region: REGION, secrets: EMAIL_SECRETS };
const CALLABLE_STRIPE = { region: REGION, secrets: STRIPE_SECRETS };
const CALLABLE_OPERATOR = {
  region: REGION,
  secrets: [...STRIPE_SECRETS, ...OPERATOR_SECRETS],
};

function requireAuth(request) {
  if (!request.auth?.uid) {
    const locale = localeFromRequest(request);
    throw new HttpsError("unauthenticated", t(locale, "err.unauthenticated"), { key: "err.unauthenticated" });
  }
  return { uid: request.auth.uid, email: request.auth.token.email || null };
}

function isHttpsError(err) {
  return (
    err instanceof HttpsError ||
    err?.name === "HttpsError" ||
    (typeof err?.code === "string" && typeof err?.httpErrorCode === "object")
  );
}

function rethrowAsHttps(err, label) {
  if (isHttpsError(err)) throw err;
  console.error(label || "callable failed", err);
  throw new HttpsError("internal", String(err?.message || err));
}

function wrapCallable(name, handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (err) {
      rethrowAsHttps(err, name);
    }
  };
}

module.exports = {
  onCall,
  onRequest,
  HttpsError,
  REGION,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  STRIPE_SECRETS,
  EMAIL_SECRETS,
  OPERATOR_SECRETS,
  CALLABLE,
  CALLABLE_MAIL,
  CALLABLE_STRIPE,
  CALLABLE_OPERATOR,
  requireAuth,
  isHttpsError,
  rethrowAsHttps,
  wrapCallable,
};
