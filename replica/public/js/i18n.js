const STORAGE_KEY = "replica.locale";
const SUPPORTED = ["nl", "fr", "de", "en"];
const DEFAULT_LOCALE = "nl";

let current = DEFAULT_LOCALE;
let dicts = {};
const listeners = new Set();

export function normalizeLocale(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace("_", "-");
  const two = raw.slice(0, 2);
  return SUPPORTED.includes(two) ? two : DEFAULT_LOCALE;
}

function interpolate(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? `{${key}}` : String(vars[key])));
}

export function t(key, vars) {
  const dict = dicts[current] || {};
  const fallback = dicts[DEFAULT_LOCALE] || {};
  const template = dict[key] || fallback[key];
  if (template == null) return key;
  return interpolate(template, vars);
}

export function getLocale() {
  return current;
}

export function bcp47(locale = current) {
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

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria")));
  });
  const select = document.getElementById("langSelect");
  if (select && select.value !== current) select.value = current;
  document.documentElement.lang = current;
  const titleKey = document.documentElement.getAttribute("data-i18n-title");
  if (titleKey) document.title = t(titleKey);
}

export function hasStoredLocale() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch (_) {
    return false;
  }
}

function readStoredLocale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLocale(raw);
  } catch (_) {
    return null;
  }
}

export function rememberLocale(code) {
  current = normalizeLocale(code);
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch (_) {
    /* ignore */
  }
}

export async function persistLocaleIfSignedIn() {
  if (!window.functions || !window.auth?.currentUser) return;
  try {
    const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js");
    await httpsCallable(window.functions, "setFamilyLocale")({ locale: current });
  } catch (_) {
    /* optional */
  }
}

function mountLangSwitcher() {
  if (document.getElementById("langSwitcher")) return;
  const bar = document.createElement("div");
  bar.id = "langSwitcher";
  bar.className = "lang-switcher";
  bar.innerHTML = `
    <label for="langSelect" data-i18n="lang.label"></label>
    <select id="langSelect" data-i18n-aria="lang.label">
      <option value="nl">NL</option>
      <option value="fr">FR</option>
      <option value="de">DE</option>
      <option value="en">EN</option>
    </select>
  `;
  document.body.prepend(bar);
  const select = bar.querySelector("#langSelect");
  select.value = current;
  select.addEventListener("change", () => {
    setLocale(select.value, { persist: true });
  });
}

export async function setLocale(code, { persist = true } = {}) {
  rememberLocale(code);
  applyDom();
  listeners.forEach((fn) => {
    try {
      fn(current);
    } catch (err) {
      console.warn("locale listener", err);
    }
  });
  if (persist) await persistLocaleIfSignedIn();
}

export async function loadDictionaries() {
  const loaded = await Promise.all(
    SUPPORTED.map(async (code) => {
      const res = await fetch(new URL(`./i18n/${code}.json`, import.meta.url));
      if (!res.ok) throw new Error(`locale ${code} missing`);
      return [code, await res.json()];
    })
  );
  dicts = Object.fromEntries(loaded);
}

export async function applyFamilyLocale(code) {
  if (hasStoredLocale() || !code) return;
  await setLocale(code, { persist: false });
  rememberLocale(code);
}

export async function bootI18n(preferred) {
  if (!Object.keys(dicts).length) await loadDictionaries();
  const stored = readStoredLocale();
  current = normalizeLocale(preferred || stored || DEFAULT_LOCALE);
  if (stored) rememberLocale(current);
  mountLangSwitcher();
  applyDom();
}

export const AUTH_ERROR_KEYS = [
  "email-already-in-use",
  "invalid-credential",
  "wrong-password",
  "user-not-found",
  "weak-password",
  "invalid-email",
  "too-many-requests",
  "user-disabled",
];
