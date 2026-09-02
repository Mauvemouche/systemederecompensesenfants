"use strict";

const NAME_MAX = 40;

const REFERRAL_BEST_DOC_ID = "referral_best";

function cleanName(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function looksLikeUrlOrEmail(value) {
  const s = String(value || "");
  return /https?:\/\/|www\.|:\/\//i.test(s) || /@/.test(s) || /\S+\.\S+\//.test(s);
}

function makeNormKey(first, last) {
  return `${cleanName(first)} ${cleanName(last)}`.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseReferralNames(first, last) {
  const givenFirst = cleanName(first);
  const givenLast = cleanName(last);
  if (!givenFirst && !givenLast) return { action: "skip" };
  if (!givenFirst || !givenLast) return { action: "invalid" };
  if (givenFirst.length > NAME_MAX || givenLast.length > NAME_MAX) return { action: "invalid" };
  if (looksLikeUrlOrEmail(givenFirst) || looksLikeUrlOrEmail(givenLast)) return { action: "invalid" };
  return {
    action: "save",
    givenFirst,
    givenLast,
    normKey: makeNormKey(givenFirst, givenLast),
  };
}

function canWriteReferral(existing) {
  const status = existing?.status;
  if (status === "saved" || status === "skipped") return false;
  return true;
}

function createdAtMs(value) {
  if (value == null) return Number.MAX_SAFE_INTEGER;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function modeName(rows, normKey, field) {
  const freq = new Map();
  for (const row of rows) {
    if (row.normKey !== normKey) continue;
    const name = row[field];
    const cur = freq.get(name) || { count: 0, firstSeen: createdAtMs(row.createdAt) };
    cur.count += 1;
    cur.firstSeen = Math.min(cur.firstSeen, createdAtMs(row.createdAt));
    freq.set(name, cur);
  }
  const ranked = [...freq.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    if (a[1].firstSeen !== b[1].firstSeen) return a[1].firstSeen - b[1].firstSeen;
    return a[0] < b[0] ? -1 : 1;
  });
  return ranked[0]?.[0] || "";
}

function pickBestReferrer(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byKey = new Map();
  for (const row of list) {
    const key = row.normKey;
    if (!key) continue;
    let g = byKey.get(key);
    if (!g) {
      g = { normKey: key, count: 0, firstSeen: createdAtMs(row.createdAt) };
      byKey.set(key, g);
    }
    g.count += 1;
    g.firstSeen = Math.min(g.firstSeen, createdAtMs(row.createdAt));
  }
  const groups = [...byKey.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen;
    return a.normKey < b.normKey ? -1 : 1;
  });
  const top = groups[0];
  if (!top || top.count < 1) return { displayFirst: "", displayLast: "", count: 0 };
  return {
    displayFirst: modeName(list, top.normKey, "givenFirst"),
    displayLast: modeName(list, top.normKey, "givenLast"),
    count: top.count,
  };
}

function publicThanksPayload(winner) {
  const count = Number(winner?.count) || 0;
  if (count < 1 || !winner.displayFirst || !winner.displayLast) return null;
  return {
    displayFirst: String(winner.displayFirst),
    displayLast: String(winner.displayLast),
    count,
  };
}

module.exports = {
  NAME_MAX,
  REFERRAL_BEST_DOC_ID,
  cleanName,
  looksLikeUrlOrEmail,
  makeNormKey,
  parseReferralNames,
  canWriteReferral,
  pickBestReferrer,
  publicThanksPayload,
};
