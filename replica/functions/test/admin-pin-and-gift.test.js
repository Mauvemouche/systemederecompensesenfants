"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isComplimentaryForever } = require("../lib/founderGift");
const { serializeState } = require("../lib/replicaState");
const { needsAdminPin } = require("../lib/access");
const { createAdminToken, adminTokenValid, isFourDigitPin, generateFourDigitPin } = require("../lib/adminPinFormat");
const { welcomeVerifyEmailHtml, welcomeVerifyEmailText } = require("../lib/mailer");

describe("founder gift detection", () => {
  it("treats 100% off forever as complimentary", () => {
    assert.equal(
      isComplimentaryForever({
        discount: { coupon: { percent_off: 100, duration: "forever" } },
      }),
      true
    );
  });

  it("treats a forever coupon with amount due 0 as complimentary", () => {
    assert.equal(
      isComplimentaryForever(
        { discount: { coupon: { percent_off: 20, duration: "forever" } } },
        { amountDue: 0 }
      ),
      true
    );
  });

  it("does not treat a trial with amount 0 as a gift", () => {
    assert.equal(
      isComplimentaryForever({ status: "trialing", latest_invoice: { amount_due: 0 } }),
      false
    );
  });

  it("does not treat 100% off once as forever", () => {
    assert.equal(
      isComplimentaryForever({ discount: { coupon: { percent_off: 100, duration: "once" } } }),
      false
    );
  });
});

describe("admin PIN helpers", () => {
  it("only accepts 4 digits and signs a short-lived admin token", () => {
    assert.equal(isFourDigitPin("1571"), true);
    assert.equal(isFourDigitPin("157"), false);
    assert.equal(isFourDigitPin("abcd"), false);
    const pin = generateFourDigitPin();
    assert.equal(isFourDigitPin(pin), true);
    const hash = "scrypt$abc$def";
    const token = createAdminToken("fam1", "uid1", hash, 1_700_000_000_000);
    assert.equal(adminTokenValid(token, "fam1", "uid1", hash, 1_700_000_000_000 + 1000), true);
    assert.equal(adminTokenValid(token, "fam1", "uid1", hash, 1_700_000_000_000 + 3 * 60 * 60 * 1000), false);
    assert.equal(adminTokenValid(token, "fam2", "uid1", hash, 1_700_000_000_000 + 1000), false);
  });
});

describe("serializeState never leaks the PIN hash", () => {
  it("sets needsAdminPin and strips adminPinHash", () => {
    assert.equal(needsAdminPin({ people: [] }), true);
    assert.equal(needsAdminPin({ adminPinHash: "scrypt$aa$bb" }), false);
    const state = serializeState(
      "fam1",
      { status: "active", ownerUid: "u1", stripeSubscriptionId: "sub_1", complimentaryForever: true },
      { people: [{ id: "papa", name: "Papa", role: "parent" }], kidsNamed: true, adminPinHash: "scrypt$secret$hash" },
      "u1",
      { instanceId: "recompenses-test" }
    );
    assert.equal(JSON.stringify(state).includes("scrypt$secret$hash"), false);
    assert.equal(JSON.stringify(state).includes("adminPinHash"), false);
    assert.equal(state.needsAdminPin, false);
    assert.equal(state.complimentaryForever, true);
    assert.equal(state.billing.complimentaryForever, true);
    assert.equal(state.dailyEmailOptIn, true);
    const optedOut = serializeState(
      "fam1",
      { status: "active", ownerUid: "u1", stripeSubscriptionId: "sub_1" },
      { people: [{ id: "papa", name: "Papa", role: "parent" }], kidsNamed: true, adminPinHash: "x", dailyEmailOptIn: false },
      "u1"
    );
    assert.equal(optedOut.dailyEmailOptIn, false);
  });
});

describe("welcome email copy", () => {
  it("includes the French welcome, code, admin PIN story, prices, and contact", () => {
    const html = welcomeVerifyEmailHtml("482910", "fr");
    const text = welcomeVerifyEmailText("482910", "fr");
    for (const body of [html, text]) {
      assert.match(body, /Bienvenue/);
      assert.match(body, /482910/);
      assert.match(body, /tâches/);
      assert.match(body, /étoiles/);
      assert.match(body, /temps d’écran/);
      assert.match(body, /4 chiffres/);
      assert.match(body, /Changer le code Admin/);
      assert.match(body, /Récupérer le code Admin/);
      assert.match(body, /2,50/);
      assert.match(body, /25/);
      assert.match(body, /bière/);
      assert.match(body, /kidsrewardsystem@proton\.me/);
      assert.match(body, /résumé quotidien|écran d’accueil/);
      assert.match(body, /mon nom ne sera dévoilé qu'aux utilisateurs payants/);
      assert.match(body, /Ce code expire après 15 minutes/);
      assert.match(body, /récompense et responsabilités/);
      assert.match(body, /carte enregistrée/);
      assert.match(body, /À vous de jouer ! 😉/);
      assert.equal(/À très vite !/.test(body), false);
    }
    assert.match(html, /<h2 style="margin:22px 0 10px;font-size:22px;">À vous de jouer ! 😉<\/h2>/);
    const afterSignoff = html.split("À vous de jouer ! 😉")[1] || "";
    assert.equal(afterSignoff.includes("Un papa belge"), false);
  });
});
