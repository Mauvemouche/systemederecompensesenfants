"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  parseReferralNames,
  canWriteReferral,
  pickBestReferrer,
  publicThanksPayload,
  makeNormKey,
  REFERRAL_BEST_DOC_ID,
} = require("../lib/referrals");
const { serializeState, familyNeedsReferralPrompt } = require("../lib/replicaState");

const repoRoot = path.join(__dirname, "..", "..", "..");

describe("referral name parsing", () => {
  it("treats empty skip as no aggregatable write", () => {
    assert.deepEqual(parseReferralNames("  ", ""), { action: "skip" });
    assert.deepEqual(parseReferralNames("", ""), { action: "skip" });
  });

  it("rejects URLs, emails, a single name, and overlong names", () => {
    assert.equal(parseReferralNames("https://evil.test", "Smith").action, "invalid");
    assert.equal(parseReferralNames("Ada", "www.spam.test").action, "invalid");
    assert.equal(parseReferralNames("Ada", "ada@example.com").action, "invalid");
    assert.equal(parseReferralNames("Ada", "").action, "invalid");
    assert.equal(parseReferralNames("A".repeat(41), "Lovelace").action, "invalid");
  });

  it("trims, caps length, and builds a case-insensitive normKey", () => {
    const parsed = parseReferralNames("  Marie  ", "  Curie  ");
    assert.equal(parsed.action, "save");
    assert.equal(parsed.givenFirst, "Marie");
    assert.equal(parsed.givenLast, "Curie");
    assert.equal(parsed.normKey, "marie curie");
    assert.equal(makeNormKey("Marie", "Curie"), makeNormKey("marie", "CURIE"));
  });
});

describe("one referral per family", () => {
  it("allows a first write from pending or missing, then never again", () => {
    assert.equal(canWriteReferral(null), true);
    assert.equal(canWriteReferral({ status: "pending" }), true);
    assert.equal(canWriteReferral({ status: "saved" }), false);
    assert.equal(canWriteReferral({ status: "skipped" }), false);
  });
});

describe("all-time best referrer", () => {
  it("counts every saved referral case-insensitively, including leftover monthKeys", () => {
    const winner = pickBestReferrer([
      { givenFirst: "marie", givenLast: "curie", normKey: "marie curie", createdAt: 30, monthKey: "2026-08" },
      { givenFirst: "Marie", givenLast: "Curie", normKey: "marie curie", createdAt: 10, monthKey: "2026-09" },
      { givenFirst: "Marie", givenLast: "Curie", normKey: "marie curie", createdAt: 20, monthKey: "2026-07" },
      { givenFirst: "Pierre", givenLast: "Curie", normKey: "pierre curie", createdAt: 1, monthKey: "2026-09" },
    ]);
    assert.equal(winner.count, 3);
    assert.equal(winner.displayFirst, "Marie");
    assert.equal(winner.displayLast, "Curie");
  });

  it("breaks equal counts with the earliest createdAt, then name", () => {
    const winner = pickBestReferrer([
      { givenFirst: "Zoé", givenLast: "B", normKey: "zoé b", createdAt: 50 },
      { givenFirst: "Anne", givenLast: "A", normKey: "anne a", createdAt: 20 },
    ]);
    assert.equal(winner.count, 1);
    assert.equal(winner.displayFirst, "Anne");
    assert.equal(winner.displayLast, "A");
  });

  it("hides the thanks payload when nobody has referrals yet", () => {
    assert.equal(publicThanksPayload(pickBestReferrer([])), null);
    assert.equal(publicThanksPayload({ displayFirst: "A", displayLast: "B", count: 0 }), null);
    const shown = publicThanksPayload({ displayFirst: "Ada", displayLast: "Lovelace", count: 2 });
    assert.deepEqual(shown, { displayFirst: "Ada", displayLast: "Lovelace", count: 2 });
    assert.equal("familyId" in shown, false);
  });
});

describe("replica board referral prompt wiring", () => {
  it("asks after a real paid invoice, not after trial checkout", () => {
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    const checkoutFn = billing.split("exports.confirmCheckoutSession")[1].split("exports.createPortalSession")[0];
    assert.equal(checkoutFn.includes("markReferralPromptPending"), false);
    const checkoutHook = billing.split('case "checkout.session.completed"')[1].split("case \"customer.subscription.created\"")[0];
    assert.equal(checkoutHook.includes("markReferralPromptPending"), false);
    const invoiceHook = billing.split('case "invoice.paid"')[1].split("default:")[0];
    assert.match(invoiceHook, /amount_paid/);
    assert.match(invoiceHook, /markReferralPromptPending\(familyId\)/);
    assert.match(billing, /hasPaidInvoice/);
  });

  it("recomputes the all-time public winner immediately after save, not a month doc", () => {
    const src = fs.readFileSync(path.join(repoRoot, "replica/functions/referrals.js"), "utf8");
    assert.match(src, /if \(wroteAgg\) await writeBestReferrer\(\)/);
    assert.match(src, /exports\.refreshReferralBest/);
    assert.equal(src.includes("writeMonthWinner"), false);
    assert.equal(src.includes("refreshReferralMonth"), false);
    assert.equal(src.includes("monthKey"), false);

    const load = fs.readFileSync(path.join(repoRoot, "replica/functions/lib/replicaLoad.js"), "utf8");
    assert.match(load, /collection\("referrals"\)\.get\(\)/);
    assert.equal(load.includes('where("monthKey"'), false);
    assert.match(load, /REFERRAL_BEST_DOC_ID/);
    assert.equal(load.includes("referral_month_"), false);
    assert.equal(REFERRAL_BEST_DOC_ID, "referral_best");

    const payload = load.match(/const payload = \{[\s\S]*?\};/);
    assert.ok(payload, "public winner payload");
    assert.match(payload[0], /displayFirst/);
    assert.match(payload[0], /displayLast/);
    assert.match(payload[0], /count/);
    assert.equal(payload[0].includes("familyId"), false);
    assert.equal(payload[0].includes("monthKey"), false);
  });

  it("hides the home-screen thanks line when count is 0 and keeps skip off the aggregatable collection", () => {
    const stateEmpty = serializeState("fam1", { status: "trialing", ownerUid: "u1", stripeSubscriptionId: "sub_1" }, { kidsNamed: true, adminPinHash: "x" }, "u1", {
      referral: { status: "pending" },
      referralThanks: null,
    });
    assert.equal(stateEmpty.needsReferralPrompt, false);
    assert.equal(familyNeedsReferralPrompt({ status: "pending" }, { hasPaidInvoice: true }), true);
    assert.equal(familyNeedsReferralPrompt({ status: "pending" }, {}), false);

    const afterPaid = serializeState(
      "fam1",
      { status: "active", ownerUid: "u1", stripeSubscriptionId: "sub_1", hasPaidInvoice: true },
      { kidsNamed: true, adminPinHash: "x" },
      "u1",
      { referral: { status: "pending" }, referralThanks: null }
    );
    assert.equal(afterPaid.needsReferralPrompt, true);
    assert.equal(stateEmpty.referralThanks, null);

    const skipped = serializeState("fam1", { status: "trialing", ownerUid: "u1", stripeSubscriptionId: "sub_1" }, { kidsNamed: true, adminPinHash: "x" }, "u1", {
      referral: { status: "skipped" },
      referralThanks: { displayFirst: "Ada", displayLast: "Lovelace", count: 0 },
    });
    assert.equal(skipped.needsReferralPrompt, false);
    assert.equal(skipped.referralThanks, null);

    const src = fs.readFileSync(path.join(repoRoot, "replica/functions/referrals.js"), "utf8");
    const skipBlock = src.match(/if \(parsed\.action === "skip"\) \{[\s\S]*?return false;/);
    assert.ok(skipBlock, "skip branch");
    assert.equal(skipBlock[0].includes("collection(\"referrals\")"), false);

    const html = fs.readFileSync(path.join(repoRoot, "replica/public/index.html"), "utf8");
    assert.match(html, /id="referralThanks"/);
    assert.match(html, /id="referralOverlay"/);
    const gate = fs.readFileSync(path.join(repoRoot, "replica/public/js/family-gate.js"), "utf8");
    assert.match(gate, /maybeShowReferralPrompt/);
    assert.match(gate, /skipReferral/);
    assert.match(gate, /submitReferral/);
    assert.match(gate, /handleCheckoutReturn/);
  });

  it("uses all-time thank-you copy with a capital T and no month wording", () => {
    const en = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n/en.json"), "utf8"));
    assert.equal(
      en["referral.thanks"],
      "Thank you to our best recruiter currently: {first} {last} with {count} recruited subscriptions! ❤️🙏"
    );
    assert.match(en["referral.lead"], /current best recruiter/);
    assert.equal(/month/i.test(en["referral.thanks"]), false);
    assert.equal(/month/i.test(en["referral.lead"]), false);
    for (const loc of ["nl", "fr", "de"]) {
      const dict = JSON.parse(fs.readFileSync(path.join(repoRoot, "replica/public/js/i18n", `${loc}.json`), "utf8"));
      assert.equal(/of the month|this month|du mois|ce mois|van de maand|deze maand|des Monats|diesem Monat/i.test(dict["referral.thanks"]), false, loc);
      assert.equal(/month's best|meilleur du mois|beste van de maand|beste des Monats/i.test(dict["referral.lead"]), false, loc);
    }
  });

  it("does not add the referral prompt to Anthony's live public/ app", () => {
    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("referralOverlay"), false);
    assert.equal(liveIndex.includes("referralThanks"), false);
    assert.equal(liveIndex.includes("gate.checkoutCancel"), false);
    assert.equal(liveIndex.includes("gate.passwordHint"), false);
    const liveFns = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(liveFns.includes("submitReferral"), false);
  });
});
