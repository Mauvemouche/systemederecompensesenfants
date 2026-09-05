"use strict";

const { ensureApp, serverTimestamp } = require("./lib/adminApp");
const { hasAppAccess, needsCheckout, billingFromSubscription } = require("./lib/access");
const { loadReplicaState, markReferralPromptPending } = require("./lib/replicaLoad");
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
  shouldKeepExistingMembership,
} = require("./lib/families");
const { buildCheckoutSessionParams, resolvePriceId, resolveCheckoutPlan, assertSandboxKey, resolveCheckoutTrial, isLiveStripeProject, assertStripeLivemode, checkoutSessionIdOk } = require("./lib/stripeCheckout");
const { stripeRequest, verifyStripeSignature } = require("./lib/stripeHttp");
const {
  onCall,
  onRequest,
  HttpsError,
  REGION,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_SECRETS,
  CALLABLE,
  CALLABLE_STRIPE,
  CALLABLE_OPERATOR,
  requireAuth,
  wrapCallable,
} = require("./lib/callable");
const { t, localeFromRequest, normalizeLocale, stripeCheckoutLocale } = require("./lib/i18n");
const { legalAcceptPatch, stripeSubscriptionCancelPath } = require("./lib/gdpr");
const {
  publicContactPayload,
  invoicesIncludePaidCharge,
  canRevealOperator,
  revealPayload,
  loadOperatorIdentity,
  listCustomerInvoices,
} = require("./lib/operatorIdentity");

function instanceId() {
  return process.env.GCLOUD_PROJECT || ensureApp().options.projectId || "replica";
}

async function loadState(familyId, uid) {
  return loadReplicaState(familyId, uid);
}

async function requireFamilyOwner(uid, locale) {
  const memberSnap = await memberRef(uid).get();
  const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
  if (!familyId) {
    throw new HttpsError("failed-precondition", t(locale, "err.familyMissing"), { key: "err.familyMissing" });
  }
  const billing = await readFamilyBilling(familyId);
  if (!billing?.ownerUid) {
    throw new HttpsError("failed-precondition", t(locale, "err.familyMissing"), { key: "err.familyMissing" });
  }
  if (billing.ownerUid !== uid) {
    throw new HttpsError("permission-denied", t(locale, "err.ownerOnly"), { key: "err.ownerOnly" });
  }
  return { familyId, billing };
}

async function persistFamilyLocale(familyId, locale) {
  const loc = normalizeLocale(locale);
  await familyRef(familyId).set({ locale: loc, updatedAt: serverTimestamp() }, { merge: true });
  await settingsRef(familyId).set({ locale: loc, updatedAt: serverTimestamp() }, { merge: true });
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
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (!next.stripeCustomerId) delete next.stripeCustomerId;
  if (next.stripeSubscriptionId) next.trialUsed = true;
  await billingRef(familyId).set(next, { merge: true });
  if (next.stripeCustomerId) {
    await stripeCustomerIndexRef(next.stripeCustomerId).set(
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
    const locale = localeFromRequest(request);
    const plan = data.plan === "yearly" ? "yearly" : "monthly";

    ensureApp();
    const resolved = await resolveFamilyForUser(uid, email, plan, locale);
    const familyId = resolved.familyId;
    if (!familyId) {
      throw new HttpsError("internal", t(locale, "err.internalFamily"), { key: "err.internalFamily" });
    }

    const claimed = await setFamilyClaim(uid, familyId);
    const billing = await readFamilyBilling(familyId);
    if (billing?.ownerUid === uid && locale) {
      await persistFamilyLocale(familyId, locale);
    }
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

exports.getOperatorLegalIdentity = onCall(
  CALLABLE_OPERATOR,
  wrapCallable("getOperatorLegalIdentity", async (request) => {
    const { uid } = requireAuth(request);
    ensureApp();
    const publicPayload = publicContactPayload();

    const memberSnap = await memberRef(uid).get();
    const familyId = memberSnap.exists ? memberSnap.data().familyId : null;
    if (!familyId) return publicPayload;

    const billing = await readFamilyBilling(familyId);
    if (!shouldKeepExistingMembership(billing, uid)) return publicPayload;
    if (!billing?.stripeCustomerId) return publicPayload;

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return publicPayload;

    let invoices = [];
    try {
      invoices = await listCustomerInvoices(stripeRequest, secret, billing.stripeCustomerId);
    } catch (err) {
      console.error("getOperatorLegalIdentity invoices failed", err?.message || err);
      return publicPayload;
    }

    const paidCharge = invoicesIncludePaidCharge(invoices);
    if (!paidCharge) return publicPayload;

    const operator = await loadOperatorIdentity();
    if (!canRevealOperator(operator, paidCharge)) return publicPayload;
    return revealPayload(operator);
  })
);

exports.createCheckoutSession = onCall(
  CALLABLE_STRIPE,
  wrapCallable("createCheckoutSession", async (request) => {
    const { uid, email } = requireAuth(request);
    const data = request.data || {};
    const locale = localeFromRequest(request);
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    if (data.acceptedWithdrawal !== true) {
      throw new HttpsError("failed-precondition", t(locale, "err.acceptedWithdrawal"), { key: "err.acceptedWithdrawal" });
    }
    if (!needsCheckout(billing)) {
      throw new HttpsError("failed-precondition", t(locale, "err.subscriptionActive"), { key: "err.subscriptionActive" });
    }

    const origin = String(data.origin || "").replace(/\/$/, "");
    if (!origin || !/^https?:\/\//i.test(origin)) {
      throw new HttpsError("invalid-argument", t(locale, "err.originHttps"), { key: "err.originHttps" });
    }

    const plan = resolveCheckoutPlan(data.plan, billing.plan);
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

    let stripeSubscriptions = [];
    if (customerId) {
      try {
        const listed = await stripeRequest(
          "GET",
          "/subscriptions",
          { customer: customerId, status: "all", limit: 100 },
          secret
        );
        stripeSubscriptions = listed.data || [];
      } catch (err) {
        console.error("list subscriptions for trial check failed", err?.message || err);
        stripeSubscriptions = [];
      }
    }
    const offerTrial = resolveCheckoutTrial({
      trialUsed: billing.trialUsed === true,
      stripeSubscriptions,
    });

    const params = buildCheckoutSessionParams({
      instanceId: instanceId(),
      familyId,
      uid,
      email,
      plan,
      origin,
      customerId,
      locale: stripeCheckoutLocale(locale),
      offerTrial,
    });

    const session = await stripeRequest("POST", "/checkout/sessions", params, secret);

    await familyRef(familyId).set(
      {
        ...legalAcceptPatch({ termsPrivacy: true, withdrawal: true, locale, now: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
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
    const locale = localeFromRequest(request);
    const { familyId } = await requireFamilyOwner(uid, locale);

    const sessionId = data.sessionId;
    if (!checkoutSessionIdOk(sessionId)) {
      const key = isLiveStripeProject() ? "err.sessionLive" : "err.sessionSandbox";
      throw new HttpsError("invalid-argument", t(locale, key), { key });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    const session = await stripeRequest(
      "GET",
      `/checkout/sessions/${sessionId}`,
      { expand: ["subscription", "subscription.latest_invoice", "subscription.discount"] },
      secret
    );

    try {
      assertStripeLivemode(session.livemode);
    } catch {
      const key = isLiveStripeProject() ? "err.testEvent" : "err.liveEvent";
      throw new HttpsError("failed-precondition", t(locale, key), { key });
    }

    const sessionFamilyId = await resolveFamilyIdFromStripe(session, session);
    if (sessionFamilyId && sessionFamilyId !== familyId) {
      throw new HttpsError("permission-denied", t(locale, "err.sessionOtherFamily"), { key: "err.sessionOtherFamily" });
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
    const locale = localeFromRequest(request);
    const { billing } = await requireFamilyOwner(uid, locale);
    if (!billing.stripeCustomerId) {
      throw new HttpsError("failed-precondition", t(locale, "err.noStripeCustomer"), { key: "err.noStripeCustomer" });
    }
    const origin = String(data.origin || "").replace(/\/$/, "");
    if (!origin) throw new HttpsError("invalid-argument", t(locale, "err.originRequired"), { key: "err.originRequired" });

    const session = await stripeRequest(
      "POST",
      "/billing_portal/sessions",
      { customer: billing.stripeCustomerId, return_url: origin },
      process.env.STRIPE_SECRET_KEY
    );
    return { url: session.url };
  })
);

exports.cancelSubscription = onCall(
  CALLABLE_STRIPE,
  wrapCallable("cancelSubscription", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    if (billing.complimentaryForever) {
      throw new HttpsError("failed-precondition", t(locale, "err.noCancelGift"), { key: "err.noCancelGift" });
    }
    const path = stripeSubscriptionCancelPath(billing.stripeSubscriptionId);
    if (!path) {
      throw new HttpsError("failed-precondition", t(locale, "err.noSubscription"), { key: "err.noSubscription" });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      throw new HttpsError("failed-precondition", t(locale, "err.cancelFailed"), { key: "err.cancelFailed" });
    }

    let sub;
    try {
      if (billing.cancelAtPeriodEnd) {
        sub = await stripeRequest("GET", path, {}, secret);
      } else {
        sub = await stripeRequest("POST", path, { cancel_at_period_end: true }, secret);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      if (/already been canceled|No such subscription|resource_missing/i.test(msg)) {
        await applyFamilyBilling(familyId, {
          status: "canceled",
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: billing.stripeSubscriptionId,
        });
        return loadState(familyId, uid);
      }
      console.error("cancelSubscription Stripe failed", err?.message || err);
      throw new HttpsError("unavailable", t(locale, "err.cancelFailed"), { key: "err.cancelFailed" });
    }

    await applyFamilyBilling(familyId, billingFromSubscription(sub, { customerId: billing.stripeCustomerId }));
    return loadState(familyId, uid);
  })
);

exports.saveChildren = onCall(
  CALLABLE,
  wrapCallable("saveChildren", async (request) => {
    const { uid } = requireAuth(request);
    const data = request.data || {};
    const locale = localeFromRequest(request);
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    if (!hasAppAccess(billing)) {
      throw new HttpsError("failed-precondition", t(locale, "err.subscriptionRequired"), { key: "err.subscriptionRequired" });
    }

    const names = Array.isArray(data.childNames) ? data.childNames : [];
    const cleaned = names.map((n) => String(n || "").trim()).filter(Boolean);
    if (cleaned.length < 1 || cleaned.length > 6) {
      throw new HttpsError("invalid-argument", t(locale, "err.childNames"), { key: "err.childNames" });
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
    const locale = localeFromRequest(request);
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    if (!hasAppAccess(billing)) {
      throw new HttpsError("failed-precondition", t(locale, "err.subscriptionRequired"), { key: "err.subscriptionRequired" });
    }

    const personId = String(request.data?.personId || "").trim();
    if (!personId) {
      throw new HttpsError("invalid-argument", t(locale, "err.personRequired"), { key: "err.personRequired" });
    }

    const settings = await readFamilySettings(familyId);
    const currentPeople = Array.isArray(settings?.people) && settings.people.length ? settings.people : DEFAULT_FAMILY;
    const result = renamePersonInList(currentPeople, personId, request.data?.name);
    if (result.error === "invalid-name") {
      throw new HttpsError("invalid-argument", t(locale, "err.invalidName"), { key: "err.invalidName" });
    }
    if (result.error === "not-found") {
      throw new HttpsError("not-found", t(locale, "err.personNotFound"), { key: "err.personNotFound" });
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

exports.setFamilyLocale = onCall(
  CALLABLE,
  wrapCallable("setFamilyLocale", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    const { familyId, billing } = await requireFamilyOwner(uid, locale);
    await persistFamilyLocale(familyId, locale);
    return loadState(familyId, uid);
  })
);

exports.setDailyEmailOptIn = onCall(
  CALLABLE,
  wrapCallable("setDailyEmailOptIn", async (request) => {
    const { uid } = requireAuth(request);
    const locale = localeFromRequest(request);
    const { familyId } = await requireFamilyOwner(uid, locale);
    const optIn = request.data?.optIn !== false;
    await settingsRef(familyId).set({ dailyEmailOptIn: optIn, updatedAt: serverTimestamp() }, { merge: true });
    return loadState(familyId, uid);
  })
);

exports.stripeWebhook = onRequest(
  {
    region: REGION,
    secrets: [...STRIPE_SECRETS, STRIPE_WEBHOOK_SECRET],
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

    try {
      assertStripeLivemode(event.livemode);
    } catch (err) {
      console.error("Refusing Stripe event for this project", err.message);
      res.status(400).send(err.message);
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
            await applyFamilyBilling(familyId, {
              ...billingFromSubscription(sub),
              ...(Number(invoice.amount_paid) > 0 ? { hasPaidInvoice: true } : {}),
            });
            if (Number(invoice.amount_paid) > 0) {
              await markReferralPromptPending(familyId);
            }
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
