"use strict";

const { LOCALES, DEFAULT_LOCALE } = require("./locales");

const SUPPORTED = new Set(["fr", "nl", "de", "en"]);

function normalizeLocale(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  const two = raw.slice(0, 2);
  if (SUPPORTED.has(two)) return two;
  return DEFAULT_LOCALE;
}

function interpolate(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? `{${key}}` : String(vars[key])
  );
}

function t(locale, key, vars) {
  const loc = normalizeLocale(locale);
  const dict = LOCALES[loc] || LOCALES[DEFAULT_LOCALE];
  const fallback = LOCALES[DEFAULT_LOCALE] || {};
  const template = dict[key] || fallback[key];
  if (template == null) return key;
  return interpolate(template, vars);
}

function localeFromRequest(request, stored) {
  return normalizeLocale(request?.data?.locale || stored);
}

function stripeCheckoutLocale(locale) {
  const loc = normalizeLocale(locale);
  return loc === "nl" || loc === "de" || loc === "en" || loc === "fr" ? loc : "fr";
}

function bcp47(locale) {
  switch (normalizeLocale(locale)) {
    case "nl":
      return "nl-BE";
    case "de":
      return "de-DE";
    case "en":
      return "en-GB";
    default:
      return "fr-BE";
  }
}

module.exports = {
  DEFAULT_LOCALE,
  SUPPORTED,
  normalizeLocale,
  interpolate,
  t,
  localeFromRequest,
  stripeCheckoutLocale,
  bcp47,
};
