"use strict";

const { ensureApp, serverTimestamp } = require("./lib/adminApp");
const { hasAppAccess, needsCheckout, billingFromSubscription } = require("./lib/access");
const { serializeState } = require("./lib/replicaState");
const { peopleFromChildNames, DEFAULT_FAMILY, renamePersonInList } = require("./lib/family");
const {
  familyRef,
  billingRef,
  settingsRef,
  memberRef,
  stripeCustomerIndexRef,
  familyIdFromStripe,
  setFamilyClaim,
  readFamilyBilling,
  readFamilySettings,
  resolveFamilyForUser,
} = require("./lib/families");
const { buildCheckoutSessionParams, resolvePriceId, assertSandboxKey } = require("./lib/stripeCheckout");
const { stripeRequest, verifyStripeSignature } = require("./lib/stripeHttp");
const {
  onCall,
  onRequest,
  HttpsError,
  REGION,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  CALLABLE,
  CALLABLE_STRIPE,
  requireAuth,
  wrapCallable,
} = require("./lib/callable");

function instanceId() {
  return process.env.GCLOUD_PROJECT || ensureApp().options.projectId || "replica";
}

async function loadState(familyId, uid) {
  return serializeState(familyId, await readFamilyBilling(familyId), await readFamilySettings(familyId), uid, {
    instanceId: instanceId(),
  });
}

async function requireFamilyOwner(uid) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) {
    throw new HttpsError("failed-precondition", "Famille non initialisée.");
  }
  const billing = await readFamilyBilling(familyId);
  if (!billing?.ownerUid) {
    throw new HttpsError("failed-precondition", "Famille non initialisée.");
  }
  if (billing.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "Seul le parent titulaire peut faire ça.");
  }
  return { familyId, billing };
}

async function tagStripeCustomer(secret, customerId, familyId, uid) {
  if (!customerId || !secret) return;
  try {
    await stripeRequest(
      "POST",
      `/customers/${customerId}`,
      {
        metadata: {
          familyId,
          instanceId: instanceId(),
          firebaseUid: uid,
        },
      },
      secret
    );
  } catch (err) {
    console.error("Could not set Stripe customer metadata", customerId, err.message);
  }
  await stripeCustomerIndexRef(customerId).set({ familyId, uid, updatedAt: serverTimestamp() }, { merge: true });
}

async function tagStripeSubscription(secret, subscriptionId, familyId, uid) {
  if (!subscriptionId || !secret) return;
  try {
    await stripeRequest(
      "POST",
      `/subscriptions/${subscriptionId}`,
      {
        metadata: {
          familyId,
          instanceId: instanceId(),
          firebaseUid: uid,
        },
      },
      secret
    );
  } catch (err) {
    console.error("Could not set Stripe subscription metadata", subscriptionId, err.message);
  }
}

async function applyFamilyBilling(familyId, patch) {
  if (!familyId) {
    console.error("applyFamilyBilling missing familyId");
    return;
  }
  await billingRef(familyId).set(
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (patch.stripeCustomerId) {
    await stripeCustomerIndexRef(patch.stripeCustomerId).set(
      { familyId, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
}

async function resolveFamilyIdFromStripe(obj, extra) {
  const fromMeta = familyIdFromStripe(obj, extra);
  if (fromMeta) {
    const fam = await familyRef(fromMeta).get();
    if (fam.exists) return fromMeta;
  }
  const customerId =
    (typeof obj?.customer === "string" && obj.customer) ||
    obj?.customer?.id ||
    extra?.customer ||
    extra?.customerId ||
    null;
  if (customerId) {
    const snap = await stripeCustomerIndexRef(customerId).get();
    if (snap.exists && snap.data().familyId) return snap.data().familyId;
  }
  return null;
}

exports.bootstrapInstance = onCall(
  CALLABLE,
  wrapCallable("bootstrapInstance", async (request) => {
    const { uid, email } = requireAuth(request);
    const data = request.data || {};
    const plan = data.plan === "yearly" ? "yearly" : "monthly";

    ensureApp();
    const resolved = await resolveFamilyForUser(uid, email, plan);
    const familyId = resolved.familyId;
    if (!familyId) {
      throw new HttpsError("internal", "Impossible de créer la famille.");
    }

    const claimed = await setFamilyClaim(uid, familyId);
    const billing = await readFamilyBilling(familyId);
    if (billing?.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
      await tagStripeCustomer(process.env.STRIPE_SECRET_KEY, billing.stripeCustomerId, familyId, uid);
      if (billing.stripeSubscriptionId) {
        await tagStripeSubscription(process.env.STRIPE_SECRET_KEY, billing.stripeSubscriptionId, familyId, uid);
      }
    }

    const state = await loadState(familyId, uid);
    state.claimsNeedRefresh = claimed || resolved.created || resolved.migrated;
    state.migratedFromLegacy = !!resolved.migrated;
    return state;
  })
);

exports.createCheckoutSession = onCall(
  CALLABLE_STRIPE,
  wrapCallable("createCheckoutSession", async (request) => {
    const { uid, email } = requireAuth(request);
    const data = request.data || {};
    const { familyId, billing } = await requireFamilyOwner(uid);
    if (!needsCheckout(billing)) {
      throw new HttpsError("failed-precondition", "Un abonnement est déjà actif.");
    }

    const origin = String(data.origin || "").replace(/\/$/, "");
    if (!origin || !/^https?:\/\//i.test(origin)) {
      throw new HttpsError("invalid-argument", "origin HTTPS requis.");
    }

    const plan = data.plan === "yearly" ? "yearly" : billing.plan || "monthly";
    const secret = process.env.STRIPE_SECRET_KEY;
    assertSandboxKey(secret);

    let customerId = billing.stripeCustomerId || null;
    if (!customerId) {
      const customer = await stripeRequest(
        "POST",
        "/customers",
        {
          email: email || undefined,
          metadata: {
            familyId,
            instanceId: instanceId(),
            firebaseUid: uid,
          },
        },
        secret
      );
      customerId = customer.id;
      await billingRef(familyId).set({ stripeCustomerId: customerId, updatedAt: serverTimestamp() }, { merge: true });
      await stripeCustomerIndexRef(customerId).set({ familyId, uid, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await tagStripeCustomer(secret, customerId, familyId, uid);
    }

    const params = buildCheckoutSessionParams({
      instanceId: instanceId(),
      familyId,
      uid,
      email,
      plan,
      origin,
      customerId,
    });

    const session = await stripeRequest("POST", "/checkout/sessions", params, secret);

    await billingRef(familyId).set(
      {
        plan,
        checkoutSessionId: session.id,
        stripeCustomerId: customerId,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { url: session.url, id: session.id, priceId: resolvePriceId(plan), familyId };
  })
);

exports.confirmCheckoutSession = onCall(
  CALLABLE_STRIPE,
  wrapCallable("confirmCheckoutSession", async (request) => {
    const { uid } = requireAuth(request);
    const data = request.data || {};
    const { familyId } = await requireFamilyOwner(uid);

    const sessionId = data.sessionId;
    if (!sessionId || !String(sessionId).startsWith("cs_test_")) {
      throw new HttpsError(
        "invalid-argument",
        "sessionId sandbox (cs_test_…) requis. Les sessions live sont refusées."
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const session = await stripeRequest(
      "GET",
      `/checkout/sessions/${sessionId}`,
      { expand: ["subscription", "subscription.latest_invoice", "subscription.discount"] },
      secret
    );

    if (session.livemode) {
      throw new HttpsError("failed-precondition", "Événement live refusé (sandbox only).");
    }

    const sessionFamilyId = await resolveFamilyIdFromStripe(session, session);
    if (sessionFamilyId && sessionFamilyId !== familyId) {
      throw new HttpsError("permission-denied", "Cette session Stripe appartient à une autre famille.");
    }

    let sub = session.subscription;
    if (typeof sub === "string") {
      sub = await stripeRequest("GET", `/subscriptions/${sub}`, {}, secret);
    }

    if (sub && sub.id) {
      await applyFamilyBilling(
        familyId,
        billingFromSubscription(sub, { customerId: session.customer, session })
      );
      await tagStripeSubscription(secret, sub.id, familyId, uid);
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      await tagStripeCustomer(secret, customerId, familyId, uid);
    }

    return loadState(familyId, uid);
  })
);

exports.createPortalSession = onCall(
  CALLABLE_STRIPE,
  wrapCallable("createPortalSession", async (request) => {
    const { uid } = requireAuth(request);
    const data = request.data || {};
    const { billing } = await requireFamilyOwner(uid);
    if (!billing.stripeCustomerId) {
      throw new HttpsError("failed-precondition", "Pas encore de client Stripe.");
    }
    const origin = String(data.origin || "").replace(/\/$/, "");
    if (!origin) throw new HttpsError("invalid-argument", "origin requis.");

    const session = await stripeRequest(
      "POST",
      "/billing_portal/sessions",
      { customer: billing.stripeCustomerId, return_url: origin },
      process.env.STRIPE_SECRET_KEY
    );
    return { url: session.url };
  })
);

exports.saveChildren = onCall(
  CALLABLE,
  wrapCallable("saveChildren", async (request) => {
    const { uid } = requireAuth(request);
    const data = request.data || {};
    const { familyId, billing } = await requireFamilyOwner(uid);
    if (!hasAppAccess(billing)) {
      throw new HttpsError("failed-precondition", "Abonnement requis.");
    }

    const names = Array.isArray(data.childNames) ? data.childNames : [];
    const cleaned = names.map((n) => String(n || "").trim()).filter(Boolean);
    if (cleaned.length < 1 || cleaned.length > 6) {
      throw new HttpsError("invalid-argument", "Indique entre 1 et 6 prénoms.");
    }

    const people = peopleFromChildNames(cleaned);
    await settingsRef(familyId).set(
      {
        people,
        kidsNamed: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return loadState(familyId, uid);
  })
);

exports.renamePerson = onCall(
  CALLABLE,
  wrapCallable("renamePerson", async (request) => {
    const { uid } = requireAuth(request);
    const { familyId, billing } = await requireFamilyOwner(uid);
    if (!hasAppAccess(billing)) {
      throw new HttpsError("failed-precondition", "Abonnement requis.");
    }

    const personId = String(request.data?.personId || "").trim();
    if (!personId) {
      throw new HttpsError("invalid-argument", "Personne requise.");
    }

    const settings = await readFamilySettings(familyId);
    const currentPeople = Array.isArray(settings?.people) && settings.people.length ? settings.people : DEFAULT_FAMILY;
    const result = renamePersonInList(currentPeople, personId, request.data?.name);
    if (result.error === "invalid-name") {
      throw new HttpsError("invalid-argument", "Le prénom doit faire entre 1 et 40 caractères.");
    }
    if (result.error === "not-found") {
      throw new HttpsError("not-found", "Personne introuvable.");
    }

    await settingsRef(familyId).set(
      {
        people: result.people,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return loadState(familyId, uid);
  })
);

exports.stripeWebhook = onRequest(
  {
    region: REGION,
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    cors: false,
    invoker: "public",
  },
  async (req, res) => {
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
            sub = await stripeRequest(
              "GET",
              `/subscriptions/${sub}`,
              { expand: ["latest_invoice", "discount"] },
              process.env.STRIPE_SECRET_KEY
            );
          }
          const familyId = await resolveFamilyIdFromStripe(session, typeof sub === "object" ? sub : null);
          if (!familyId) {
            console.error("Webhook checkout.session.completed missing familyId", session.id);
            break;
          }
          if (sub && typeof sub === "object") {
            await applyFamilyBilling(familyId, billingFromSubscription(sub, { customerId: session.customer, session }));
            const uid = session.metadata?.firebaseUid || sub.metadata?.firebaseUid;
            if (uid) await setFamilyClaim(uid, familyId);
            const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
            await tagStripeCustomer(process.env.STRIPE_SECRET_KEY, customerId, familyId, uid);
            await tagStripeSubscription(process.env.STRIPE_SECRET_KEY, sub.id, familyId, uid);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const familyId = await resolveFamilyIdFromStripe(sub);
          if (!familyId) {
            console.error("Webhook subscription event missing familyId", sub.id);
            break;
          }
          await applyFamilyBilling(familyId, billingFromSubscription(sub));
          break;
        }
        case "invoice.paid":
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
          if (subId && process.env.STRIPE_SECRET_KEY) {
            const sub = await stripeRequest(
              "GET",
              `/subscriptions/${subId}`,
              { expand: ["latest_invoice", "discount"] },
              process.env.STRIPE_SECRET_KEY
            );
            const familyId = await resolveFamilyIdFromStripe(invoice, sub);
            if (!familyId) {
              console.error("Webhook invoice event missing familyId", invoice.id);
              break;
            }
            await applyFamilyBilling(familyId, billingFromSubscription(sub));
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
  }
);
