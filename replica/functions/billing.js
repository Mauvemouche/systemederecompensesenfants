"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { hasAppAccess, needsCheckout, needsKidsSetup, billingFromSubscription } = require("./lib/access");
const { peopleFromChildNames, DEFAULT_FAMILY } = require("./lib/family");
const { buildCheckoutSessionParams, resolvePriceId, assertSandboxKey } = require("./lib/stripeCheckout");
const { stripeRequest, verifyStripeSignature } = require("./lib/stripeHttp");

function db() {
  return admin.firestore();
}

function requireAuth(context) {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Connecte-toi pour continuer.");
  }
  return { uid: context.auth.uid, email: context.auth.token.email || null };
}

function instanceId() {
  return process.env.GCLOUD_PROJECT || admin.app().options.projectId || "replica";
}

function serializeState(billing, settings, uid) {
  const billingData = billing || { status: "incomplete" };
  const settingsData = settings || { people: DEFAULT_FAMILY, kidsNamed: true };
  return {
    instanceId: instanceId(),
    ownerUid: billingData.ownerUid || null,
    isOwner: !!(uid && billingData.ownerUid === uid),
    billing: billingData,
    people: settingsData.people || DEFAULT_FAMILY,
    kidsNamed: !!settingsData.kidsNamed,
    familyName: settingsData.name || "",
    hasAccess: hasAppAccess(billingData),
    needsCheckout: needsCheckout(billingData),
    needsKids: needsKidsSetup(settingsData),
  };
}

async function readBilling() {
  const snap = await db().collection("billing").doc("current").get();
  return snap.exists ? snap.data() : null;
}

async function readSettings() {
  const snap = await db().collection("family_config").doc("settings").get();
  return snap.exists ? snap.data() : null;
}

async function assertOwner(uid) {
  const billing = await readBilling();
  if (!billing?.ownerUid) {
    throw new functions.https.HttpsError("failed-precondition", "Instance non initialisée.");
  }
  if (billing.ownerUid !== uid) {
    throw new functions.https.HttpsError("permission-denied", "Seul le parent titulaire peut faire ça.");
  }
  return billing;
}

exports.bootstrapInstance = functions.region("europe-west1").https.onCall(async (data, context) => {
  const { uid, email } = requireAuth(context);
  const plan = data?.plan === "yearly" ? "yearly" : "monthly";
  const now = admin.firestore.FieldValue.serverTimestamp();

  const billingRef = db().collection("billing").doc("current");
  const settingsRef = db().collection("family_config").doc("settings");

  await db().runTransaction(async (tx) => {
    const billingSnap = await tx.get(billingRef);
    const settingsSnap = await tx.get(settingsRef);

    if (!billingSnap.exists) {
      tx.set(billingRef, {
        status: "incomplete",
        ownerUid: uid,
        ownerEmail: email,
        plan,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const current = billingSnap.data() || {};
      if (current.ownerUid && current.ownerUid !== uid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Cette instance appartient déjà à un autre parent."
        );
      }
      if (!current.ownerUid) {
        tx.set(billingRef, { ownerUid: uid, ownerEmail: email, updatedAt: now }, { merge: true });
      }
    }

    if (!settingsSnap.exists) {
      tx.set(settingsRef, {
        name: "",
        people: DEFAULT_FAMILY,
        kidsNamed: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    tx.set(
      db().collection("users").doc(uid),
      { email, role: "parent", updatedAt: now },
      { merge: true }
    );
  });

  return serializeState(await readBilling(), await readSettings(), uid);
});

exports.createCheckoutSession = functions
  .region("europe-west1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onCall(async (data, context) => {
    const { uid, email } = requireAuth(context);
    const billing = await assertOwner(uid);
    if (!needsCheckout(billing)) {
      throw new functions.https.HttpsError("failed-precondition", "Un abonnement est déjà actif.");
    }

    const origin = String(data?.origin || "").replace(/\/$/, "");
    if (!origin || !/^https?:\/\//i.test(origin)) {
      throw new functions.https.HttpsError("invalid-argument", "origin HTTPS requis.");
    }

    const plan = data?.plan === "yearly" ? "yearly" : billing.plan || "monthly";
    const secret = process.env.STRIPE_SECRET_KEY;
    assertSandboxKey(secret);

    const params = buildCheckoutSessionParams({
      instanceId: instanceId(),
      uid,
      email,
      plan,
      origin,
    });

    const session = await stripeRequest("POST", "/checkout/sessions", params, secret);

    await db().collection("billing").doc("current").set(
      {
        plan,
        checkoutSessionId: session.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { url: session.url, id: session.id, priceId: resolvePriceId(plan) };
  });

exports.confirmCheckoutSession = functions
  .region("europe-west1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onCall(async (data, context) => {
    const { uid } = requireAuth(context);
    await assertOwner(uid);

    const sessionId = data?.sessionId;
    if (!sessionId || !String(sessionId).startsWith("cs_test_")) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "sessionId sandbox (cs_test_…) requis. Les sessions live sont refusées."
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const session = await stripeRequest(
      "GET",
      `/checkout/sessions/${sessionId}`,
      { expand: ["subscription"] },
      secret
    );

    if (session.livemode) {
      throw new functions.https.HttpsError("failed-precondition", "Événement live refusé (sandbox only).");
    }

    let sub = session.subscription;
    if (typeof sub === "string") {
      sub = await stripeRequest("GET", `/subscriptions/${sub}`, {}, secret);
    }

    if (sub && sub.id) {
      await applyBilling(billingFromSubscription(sub, { customerId: session.customer }));
    }

    return serializeState(await readBilling(), await readSettings(), uid);
  });

exports.createPortalSession = functions
  .region("europe-west1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onCall(async (data, context) => {
    const { uid } = requireAuth(context);
    const billing = await assertOwner(uid);
    if (!billing.stripeCustomerId) {
      throw new functions.https.HttpsError("failed-precondition", "Pas encore de client Stripe.");
    }
    const origin = String(data?.origin || "").replace(/\/$/, "");
    if (!origin) throw new functions.https.HttpsError("invalid-argument", "origin requis.");

    const session = await stripeRequest(
      "POST",
      "/billing_portal/sessions",
      { customer: billing.stripeCustomerId, return_url: origin },
      process.env.STRIPE_SECRET_KEY
    );
    return { url: session.url };
  });

exports.saveChildren = functions.region("europe-west1").https.onCall(async (data, context) => {
  const { uid } = requireAuth(context);
  const billing = await assertOwner(uid);
  if (!hasAppAccess(billing)) {
    throw new functions.https.HttpsError("failed-precondition", "Abonnement requis.");
  }

  const names = Array.isArray(data?.childNames) ? data.childNames : [];
  const cleaned = names.map((n) => String(n || "").trim()).filter(Boolean);
  if (cleaned.length < 1 || cleaned.length > 6) {
    throw new functions.https.HttpsError("invalid-argument", "Indique entre 1 et 6 prénoms.");
  }

  const people = peopleFromChildNames(cleaned);
  await db().collection("family_config").doc("settings").set(
    {
      people,
      kidsNamed: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return serializeState(await readBilling(), await readSettings(), uid);
});

async function applyBilling(patch) {
  await db()
    .collection("billing")
    .doc("current")
    .set(
      {
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

exports.stripeWebhook = functions
  .region("europe-west1")
  .runWith({ secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] })
  .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    let event;
    try {
      event = verifyStripeSignature(req.rawBody, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature failed", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.livemode) {
      console.error("Refusing live-mode Stripe event");
      res.status(400).send("Live mode forbidden");
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          let sub = session.subscription;
          if (typeof sub === "string" && process.env.STRIPE_SECRET_KEY) {
            sub = await stripeRequest("GET", `/subscriptions/${sub}`, {}, process.env.STRIPE_SECRET_KEY);
          }
          if (sub && typeof sub === "object") {
            await applyBilling(billingFromSubscription(sub, { customerId: session.customer }));
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await applyBilling(billingFromSubscription(event.data.object));
          break;
        case "invoice.paid":
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
          if (subId && process.env.STRIPE_SECRET_KEY) {
            const sub = await stripeRequest("GET", `/subscriptions/${subId}`, {}, process.env.STRIPE_SECRET_KEY);
            await applyBilling(billingFromSubscription(sub));
          }
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      console.error("Webhook handler error", err);
      res.status(500).send("Webhook handler failed");
    }
  });
