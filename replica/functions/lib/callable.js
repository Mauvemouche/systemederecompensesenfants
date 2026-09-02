"use strict";

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const REGION = "europe-west1";

/** Bound only on Stripe functions. EMAIL_* are never declared so deploy works without them. */
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

const CALLABLE = { region: REGION };
const CALLABLE_STRIPE = { region: REGION, secrets: [STRIPE_SECRET_KEY] };

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Connecte-toi pour continuer.");
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
  CALLABLE,
  CALLABLE_STRIPE,
  requireAuth,
  isHttpsError,
  rethrowAsHttps,
  wrapCallable,
};
