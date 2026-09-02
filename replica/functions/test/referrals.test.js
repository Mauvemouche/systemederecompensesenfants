"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  parseReferralNames,
  canWriteReferral,
  pickMonthlyWinner,
  publicThanksPayload,
  monthKeyFromDate,
  makeNormKey,
} = require("../lib/referrals");
const { serializeState } = require("../lib/replicaState");

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

describe("monthly referral winner", () => {
  it("counts case-insensitively and displays the most common capitalization", () => {
    const winner = pickMonthlyWinner([
      { givenFirst: "marie", givenLast: "curie", normKey: "marie curie", createdAt: 30 },
      { givenFirst: "Marie", givenLast: "Curie", normKey: "marie curie", createdAt: 10 },
      { givenFirst: "Marie", givenLast: "Curie", normKey: "marie curie", createdAt: 20 },
      { givenFirst: "Pierre", givenLast: "Curie", normKey: "pierre curie", createdAt: 1 },
    ]);
    assert.equal(winner.count, 3);
    assert.equal(winner.displayFirst, "Marie");
    assert.equal(winner.displayLast, "Curie");
  });

  it("breaks equal counts with the earliest createdAt, then name", () => {
    const winner = pickMonthlyWinner([
      { givenFirst: "Zoé", givenLast: "B", normKey: "zoé b", createdAt: 50 },
      { givenFirst: "Anne", givenLast: "A", normKey: "anne a", createdAt: 20 },
    ]);
    assert.equal(winner.count, 1);
    assert.equal(winner.displayFirst, "Anne");
    assert.equal(winner.displayLast, "A");
  });

  it("hides the thanks payload when the month has no referrals", () => {
    assert.equal(publicThanksPayload(pickMonthlyWinner([])), null);
    assert.equal(publicThanksPayload({ displayFirst: "A", displayLast: "B", count: 0 }), null);
    const shown = publicThanksPayload({ displayFirst: "Ada", displayLast: "Lovelace", count: 2 });
    assert.deepEqual(shown, { displayFirst: "Ada", displayLast: "Lovelace", count: 2 });
    assert.equal("familyId" in shown, false);
  });

  it("uses Europe/Brussels for the month key", () => {
    assert.equal(monthKeyFromDate(new Date("2026-09-01T00:30:00+02:00")), "2026-09");
    assert.equal(monthKeyFromDate(new Date("2026-08-31T22:30:00Z")), "2026-09");
  });
});

describe("replica board referral prompt wiring", () => {
  it("asks after checkout success, not after the first paid invoice", () => {
    const billing = fs.readFileSync(path.join(repoRoot, "replica/functions/billing.js"), "utf8");
    assert.match(billing, /markReferralPromptPending\(familyId\)/);
    assert.match(billing, /confirmCheckoutSession/);
    assert.match(billing, /checkout\.session\.completed/);
    const pending = billing.split("markReferralPromptPending");
    assert.ok(pending.length >= 3);
    assert.equal(billing.includes("hasPaidInvoice") && billing.includes("markReferralPromptPending"), true);
    const afterPaid = billing.indexOf("hasPaidInvoice");
    const firstPending = billing.indexOf("markReferralPromptPending");
    assert.ok(firstPending >= 0);
    void afterPaid;
  });

  it("hides the home-screen thanks line when count is 0 and keeps skip off the aggregatable collection", () => {
    const stateEmpty = serializeState("fam1", { status: "trialing", ownerUid: "u1", stripeSubscriptionId: "sub_1" }, { kidsNamed: true, adminPinHash: "x" }, "u1", {
      referral: { status: "pending" },
      referralThanks: null,
    });
    assert.equal(stateEmpty.needsReferralPrompt, true);
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

  it("does not add the referral prompt to Anthony's live public/ app", () => {
    const liveIndex = fs.readFileSync(path.join(repoRoot, "public/index.html"), "utf8");
    assert.equal(liveIndex.includes("referralOverlay"), false);
    assert.equal(liveIndex.includes("referralThanks"), false);
    const liveFns = fs.readFileSync(path.join(repoRoot, "functions/index.js"), "utf8");
    assert.equal(liveFns.includes("submitReferral"), false);
  });
});
