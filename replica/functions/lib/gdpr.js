"use strict";

const SECRET_KEYS = new Set([
  "adminPinHash",
  "codeHash",
  "emailHash",
  "password",
  "pin",
  "currentPin",
  "secret",
  "token",
]);

const FAMILY_SUBCOLLECTIONS = [
  "billing",
  "settings",
  "tasks",
  "users",
  "daily_stats",
  "cron_runs",
  "reset_config",
  "referral",
];

function isTimestampLike(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.toDate === "function") return true;
  if (typeof value._seconds === "number") return true;
  if (typeof value.seconds === "number" && (value.nanoseconds != null || value._nanoseconds != null)) return true;
  return false;
}

function serializeValue(value) {
  if (value == null) return value;
  if (isTimestampLike(value)) {
    try {
      if (typeof value.toDate === "function") return value.toDate().toISOString();
      const seconds = value._seconds != null ? value._seconds : value.seconds;
      return new Date(Number(seconds) * 1000).toISOString();
    } catch (_) {
      return null;
    }
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") return stripSecrets(value);
  return value;
}

function stripSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = serializeValue(value);
  }
  return out;
}

function peopleForExport(people) {
  return (Array.isArray(people) ? people : []).map((p) => ({
    id: p?.id || "",
    name: p?.name || "",
    role: p?.role || "",
    theme: p?.theme || "",
  }));
}

function billingMetadataForExport(billing) {
  if (!billing || typeof billing !== "object") return null;
  return {
    status: billing.status || null,
    plan: billing.plan || null,
    ownerEmail: billing.ownerEmail || "",
    stripeCustomerId: billing.stripeCustomerId || null,
    stripeSubscriptionId: billing.stripeSubscriptionId || null,
    stripePriceId: billing.stripePriceId || null,
    trialEnd: billing.trialEnd || null,
    currentPeriodEnd: billing.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!billing.cancelAtPeriodEnd,
    complimentaryForever: !!billing.complimentaryForever,
    hasPaidInvoice: !!billing.hasPaidInvoice,
    trialUsed: !!billing.trialUsed,
  };
}

function settingsForExport(settings) {
  if (!settings || typeof settings !== "object") return null;
  return {
    name: settings.name || "",
    kidsNamed: !!settings.kidsNamed,
    locale: settings.locale || null,
    dailyEmailOptIn: settings.dailyEmailOptIn !== false,
    people: peopleForExport(settings.people),
  };
}

function legalAcceptanceFromFamily(family) {
  if (!family || typeof family !== "object") return null;
  const nested = family.acceptedLegal && typeof family.acceptedLegal === "object" ? family.acceptedLegal : null;
  return {
    acceptedLegal: family.acceptedLegal === true || nested?.termsPrivacy === true,
    acceptedLegalAt: serializeValue(family.acceptedLegalAt || nested?.termsPrivacyAt || null),
    acceptedLegalLocale: family.acceptedLegalLocale || nested?.termsPrivacyLocale || null,
    acceptedWithdrawal: family.acceptedWithdrawal === true || nested?.withdrawal === true,
    acceptedWithdrawalAt: serializeValue(family.acceptedWithdrawalAt || nested?.withdrawalAt || null),
    acceptedWithdrawalLocale: family.acceptedWithdrawalLocale || nested?.withdrawalLocale || null,
  };
}

function legalAcceptPatch({ termsPrivacy, withdrawal, locale, now }) {
  const loc = String(locale || "").trim() || null;
  const patch = {};
  if (termsPrivacy) {
    patch.acceptedLegal = true;
    patch.acceptedLegalAt = now;
    patch.acceptedLegalLocale = loc;
  }
  if (withdrawal) {
    patch.acceptedWithdrawal = true;
    patch.acceptedWithdrawalAt = now;
    patch.acceptedWithdrawalLocale = loc;
  }
  return patch;
}

function buildFamilyExport({ familyId, family, settings, billing, tasks = [], users = [], dailyStats = [] }) {
  const fam = family && typeof family === "object" ? family : {};
  const people = peopleForExport(settings?.people);
  return {
    exportedAt: new Date().toISOString(),
    familyId: familyId || null,
    profile: {
      ownerEmail: fam.ownerEmail || billing?.ownerEmail || "",
      locale: fam.locale || settings?.locale || null,
      createdAt: serializeValue(fam.createdAt || null),
      complimentaryForever: !!billing?.complimentaryForever,
    },
    legalAcceptance: legalAcceptanceFromFamily(fam),
    people,
    settings: settingsForExport(settings),
    tasks: (Array.isArray(tasks) ? tasks : []).map((task) => stripSecrets(task)),
    users: (Array.isArray(users) ? users : []).map((user) => stripSecrets(user)),
    dailyStats: (Array.isArray(dailyStats) ? dailyStats : []).map((row) => stripSecrets(row)),
    billing: billingMetadataForExport(billing),
  };
}

function stripeSubscriptionCancelPath(subscriptionId) {
  const id = String(subscriptionId || "").trim();
  if (!id || !/^sub_/.test(id)) return null;
  return `/subscriptions/${id}`;
}

function relatedDocsToDelete(familyId, uid, stripeCustomerId) {
  const docs = [];
  if (uid) docs.push({ collection: "family_members", id: uid });
  if (stripeCustomerId) docs.push({ collection: "stripe_customers", id: stripeCustomerId });
  if (familyId) docs.push({ collection: "referrals", id: familyId });
  return docs;
}

module.exports = {
  SECRET_KEYS,
  FAMILY_SUBCOLLECTIONS,
  serializeValue,
  stripSecrets,
  peopleForExport,
  billingMetadataForExport,
  settingsForExport,
  legalAcceptanceFromFamily,
  legalAcceptPatch,
  buildFamilyExport,
  stripeSubscriptionCancelPath,
  relatedDocsToDelete,
};
