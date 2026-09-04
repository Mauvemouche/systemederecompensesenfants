import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { renderFamilyShell } from "./family-ui.js";
import { TRIAL_DAYS } from "./stripe-config.js";
import { syncFamilyClaim } from "./family-path.js";
import {
  t,
  getLocale,
  onLocaleChange,
  applyFamilyLocale,
  flushPendingFamilyLocale,
  AUTH_ERROR_KEYS,
} from "./i18n.js";
import {
  fillPublicContact,
  hidePaidOperatorIdentity,
  applyPaidOperatorIdentity,
} from "./legal-identity.js";

const $ = (id) => document.getElementById(id);

let pendingSignup = null;
let pendingGiftMessage = false;
let pendingResetEmail = null;

function callFn(name, payload = {}) {
  if (!window.functions) throw new Error(t("err.functionsMissing"));
  return httpsCallable(window.functions, name)({ ...payload, locale: getLocale() });
}

function showPanel(name) {
  ["auth", "verify", "reset", "resetConfirm", "checkout", "gift", "pin", "kids", "blocked"].forEach((key) => {
    const el = $(`gate-${key}`);
    if (el) el.classList.toggle("hidden", key !== name);
  });
}

function setGate(open) {
  const gate = $("authGate");
  if (!gate) return;
  gate.classList.toggle("hidden", !open);
  gate.setAttribute("aria-hidden", open ? "false" : "true");
}

function authErrorCode(err) {
  return String(err?.code || "").replace(/^auth\//, "");
}

function authErrorKey(err) {
  const code = authErrorCode(err);
  return AUTH_ERROR_KEYS.includes(code) ? `auth.${code}` : "auth.generic";
}

function callableErrorKey(err) {
  return err?.details?.key || err?.customData?.details?.key || "";
}

function looksLikeI18nKey(value) {
  return /^(err|auth|gate)\.[A-Za-z0-9]+$/.test(String(value || ""));
}

function translateErrorKey(key) {
  if (!key) return "";
  const translated = t(key);
  if (!translated || translated === key) return "";
  return translated;
}

function callableErrorMessage(err) {
  const key = callableErrorKey(err);
  const fromKey = translateErrorKey(key);
  if (fromKey) return fromKey;
  const msg = String(err?.message || "").trim();
  const fromMsg = translateErrorKey(msg);
  if (fromMsg) return fromMsg;
  if (msg && !looksLikeI18nKey(msg)) return msg;
  return t("err.generic");
}

function setError(msg, key) {
  document.querySelectorAll(".gate-error").forEach((el) => {
    if (key) el.dataset.errorKey = key;
    else delete el.dataset.errorKey;
    el.textContent = msg || "";
    el.style.display = msg ? "block" : "none";
  });
}

function retranslateErrors() {
  document.querySelectorAll("[data-error-key]").forEach((el) => {
    el.textContent = translateErrorKey(el.dataset.errorKey) || t("err.generic");
  });
}

function authMode() {
  return $("authForm")?.dataset.mode || "login";
}

function authIdleKey(mode = authMode()) {
  return mode === "signup" ? "gate.signup" : "gate.login";
}

function authBusyKey(mode = authMode()) {
  return mode === "signup" ? "gate.busySignup" : "gate.busyLogin";
}

function setAuthBusy(busy) {
  const submit = $("authSubmit");
  if (!submit) return;
  submit.disabled = !!busy;
  submit.setAttribute("aria-busy", busy ? "true" : "false");
  const key = busy ? authBusyKey() : authIdleKey();
  submit.setAttribute("data-i18n", key);
  submit.textContent = t(key);
}

function syncAuthLabels() {
  const form = $("authForm");
  const signup = form?.dataset.mode === "signup";
  const submit = $("authSubmit");
  if (submit && submit.getAttribute("aria-busy") !== "true") {
    const key = authIdleKey(signup ? "signup" : "login");
    submit.setAttribute("data-i18n", key);
    submit.textContent = t(key);
  } else if (submit) {
    const key = authBusyKey(signup ? "signup" : "login");
    submit.setAttribute("data-i18n", key);
    submit.textContent = t(key);
  }
  if ($("toggleAuthMode")) {
    const toggleKey = signup ? "gate.toggleLogin" : "gate.toggleSignup";
    $("toggleAuthMode").setAttribute("data-i18n", toggleKey);
    $("toggleAuthMode").textContent = t(toggleKey);
  }
  if ($("authTitle")) {
    const titleKey = signup ? "gate.signupTitle" : "gate.loginTitle";
    $("authTitle").setAttribute("data-i18n", titleKey);
    $("authTitle").textContent = t(titleKey);
  }
  const legalWrap = $("acceptLegalWrap");
  if (legalWrap) legalWrap.hidden = !signup;
  const forgotWrap = $("forgotPasswordWrap");
  if (forgotWrap) forgotWrap.hidden = signup;
}

function billingLabel(state) {
  if (state?.complimentaryForever) return t("header.billingGift");
  const status = state?.billing?.status || "";
  const labels = {
    trialing: t("header.billingTrial", { days: TRIAL_DAYS }),
    active: t("header.billingActive"),
    past_due: t("header.billingPastDue"),
    incomplete: t("header.billingIncomplete"),
    canceled: t("header.billingCanceled"),
  };
  return labels[status] || "";
}

function accountBar(state, user) {
  const bar = $("accountBar");
  if (!bar) return;
  if (!user) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  const emailEl = $("accountEmail");
  if (emailEl) emailEl.textContent = user.email || "";
  const billEl = $("accountBilling");
  if (billEl) billEl.textContent = billingLabel(state);
  const optWrap = $("dailyEmailOptInWrap");
  const opt = $("dailyEmailOptIn");
  if (optWrap && opt) {
    const show = !!(user && state?.isOwner && state?.hasAccess);
    optWrap.classList.toggle("hidden", !show);
    if (show) opt.checked = state.dailyEmailOptIn !== false;
  }
  const showOwnerTools = !!(user && state?.isOwner);
  ["exportDataBtn", "deleteAccountBtn"].forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle("hidden", !showOwnerTools);
  });
}

async function refreshPaidLegalIdentity(state) {
  fillPublicContact();
  if (!window.auth?.currentUser || !state?.familyId) {
    hidePaidOperatorIdentity();
    return;
  }
  try {
    const res = await callFn("getOperatorLegalIdentity");
    applyPaidOperatorIdentity(res.data);
  } catch (_) {
    hidePaidOperatorIdentity();
  }
}

async function applyState(state) {
  window.__replicaState = state;
  await applyFamilyLocale(state?.locale);
  await flushPendingFamilyLocale();
  await syncFamilyClaim(state);
  if (state?.people) {
    window.applyReplicaFamily?.(state.people);
    renderFamilyShell(state.people);
  }
  accountBar(state, window.auth?.currentUser);
  await refreshPaidLegalIdentity(state);
  renderReferralThanks(state);
}

async function refreshState(plan) {
  const res = await callFn("bootstrapInstance", { plan });
  const state = res.data;
  await applyState(state);
  return state;
}

function startBoardIfReady(state) {
  if (state?.hasAccess && !state?.needsKids && !state?.needsAdminPin) {
    setGate(false);
    window.startFamilyBoard?.();
    maybeShowReferralPrompt(state);
    return true;
  }
  return false;
}

function renderReferralThanks(state) {
  const el = $("referralThanks");
  if (!el) return;
  const thanks = state?.referralThanks;
  if (!thanks || !thanks.count || !thanks.displayFirst || !thanks.displayLast) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = t("referral.thanks", {
    first: thanks.displayFirst,
    last: thanks.displayLast,
    count: thanks.count,
  });
  el.classList.remove("hidden");
}

function setReferralOverlay(open) {
  const overlay = $("referralOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !open);
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) $("referralFirst")?.focus();
}

function maybeShowReferralPrompt(state) {
  if (!state?.needsReferralPrompt) {
    setReferralOverlay(false);
    return;
  }
  if (!state.hasAccess || state.needsKids || state.needsAdminPin) return;
  setReferralOverlay(true);
}

async function finishReferralPrompt(action) {
  const first = $("referralFirst")?.value || "";
  const last = $("referralLast")?.value || "";
  setError("");
  const skipBtn = $("referralSkipBtn");
  if (skipBtn) skipBtn.disabled = true;
  try {
    const res =
      action === "save"
        ? await callFn("submitReferral", { first, last })
        : await callFn("skipReferral");
    if (window.__replicaState) window.__replicaState.needsReferralPrompt = false;
    await applyState(res.data);
    setReferralOverlay(false);
  } catch (err) {
    setError(callableErrorMessage(err), callableErrorKey(err));
    const box = $("referralError");
    if (box) {
      box.style.display = "block";
      box.dataset.errorKey = callableErrorKey(err) || "err.referralName";
      box.textContent = callableErrorMessage(err) || t("err.referralName");
    }
  } finally {
    if (skipBtn) skipBtn.disabled = false;
  }
}

async function routeState(state) {
  await applyState(state);
  if (!window.auth?.currentUser) {
    setGate(true);
    showPanel(pendingSignup ? "verify" : pendingResetEmail ? "resetConfirm" : "auth");
    return;
  }
  if (state.needsCheckout) {
    setGate(true);
    showPanel("checkout");
    return;
  }
  if (pendingGiftMessage && state.complimentaryForever) {
    setGate(true);
    showPanel("gift");
    return;
  }
  if (state.needsAdminPin) {
    setGate(true);
    showPanel("pin");
    return;
  }
  if (state.needsKids) {
    setGate(true);
    showPanel("kids");
    return;
  }
  startBoardIfReady(state);
}

async function finishVerifiedLogin(email, password, token) {
  if (token) {
    await signInWithCustomToken(window.auth, token);
  } else {
    await signInWithEmailAndPassword(window.auth, email, password);
  }
  pendingSignup = null;
  const state = await refreshState();
  await routeState(state);
}

function bindUi() {
  $("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const mode = authMode();
    if (mode === "signup" && !$("acceptLegal")?.checked) {
      setError(t("err.acceptedLegal"), "err.acceptedLegal");
      return;
    }
    setAuthBusy(true);
    try {
      if (mode === "signup") {
        await callFn("requestSignup", { email, password, acceptedLegal: true });
        pendingSignup = { email, password };
        if ($("verifyEmailHint")) $("verifyEmailHint").textContent = email;
        setGate(true);
        showPanel("verify");
        $("verifyCode")?.focus();
        return;
      }
      await signInWithEmailAndPassword(window.auth, email, password);
      const state = await refreshState();
      await routeState(state);
    } catch (err) {
      if (mode === "signup") setError(callableErrorMessage(err), callableErrorKey(err));
      else setError(t(authErrorKey(err)), authErrorKey(err));
    } finally {
      setAuthBusy(false);
    }
  });

  $("toggleAuthMode")?.addEventListener("click", (e) => {
    e.preventDefault();
    const form = $("authForm");
    const signup = form.dataset.mode !== "signup";
    form.dataset.mode = signup ? "signup" : "login";
    syncAuthLabels();
    pendingSignup = null;
    pendingResetEmail = null;
    showPanel("auth");
  });

  $("forgotPasswordLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    setError("");
    pendingResetEmail = null;
    const email = $("authEmail")?.value.trim() || "";
    if ($("resetEmail")) $("resetEmail").value = email;
    showPanel("reset");
    ($("resetEmail")?.value ? $("resetRequestSubmit") : $("resetEmail"))?.focus();
  });

  $("resetRequestForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = $("resetEmail")?.value.trim() || "";
    const submit = $("resetRequestSubmit");
    if (submit) submit.disabled = true;
    try {
      await callFn("requestPasswordReset", { email });
      pendingResetEmail = email;
      if ($("authEmail")) $("authEmail").value = email;
      showPanel("resetConfirm");
      $("resetCode")?.focus();
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("resetConfirmForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = pendingResetEmail || $("resetEmail")?.value.trim() || $("authEmail")?.value.trim() || "";
    const code = $("resetCode")?.value.trim() || "";
    const password = $("resetPassword")?.value || "";
    const submit = $("resetConfirmSubmit");
    if (submit) submit.disabled = true;
    try {
      await callFn("confirmPasswordReset", { email, code, password });
      pendingResetEmail = null;
      await signInWithEmailAndPassword(window.auth, email, password);
      const state = await refreshState();
      await routeState(state);
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("resetResendBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    setError("");
    const email = pendingResetEmail || $("resetEmail")?.value.trim() || $("authEmail")?.value.trim() || "";
    if (!email) {
      showPanel("reset");
      return;
    }
    try {
      await callFn("requestPasswordReset", { email });
      pendingResetEmail = email;
      const hint = $("resetResent");
      if (hint) {
        hint.style.display = "block";
        hint.dataset.errorKey = "gate.resent";
        hint.textContent = t("gate.resent");
      }
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    }
  });

  $("resetBackToAuthBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    pendingResetEmail = null;
    showPanel("auth");
  });

  $("resetConfirmBackBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    pendingResetEmail = null;
    showPanel("auth");
  });

  $("dailyEmailOptIn")?.addEventListener("change", async (e) => {
    const checked = !!e.target.checked;
    e.target.disabled = true;
    try {
      const res = await callFn("setDailyEmailOptIn", { optIn: checked });
      await applyState(res.data);
    } catch (err) {
      e.target.checked = !checked;
      setError(callableErrorMessage(err), callableErrorKey(err));
    } finally {
      e.target.disabled = false;
    }
  });

  $("verifyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = pendingSignup?.email || $("authEmail")?.value.trim();
    const password = pendingSignup?.password || $("authPassword")?.value;
    const code = $("verifyCode")?.value.trim() || "";
    const submit = $("verifySubmit");
    if (submit) submit.disabled = true;
    try {
      const res = await callFn("verifyEmailCode", { email, code });
      await finishVerifiedLogin(email, password, res.data?.token);
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("resendCodeBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    setError("");
    const email = pendingSignup?.email || $("authEmail")?.value.trim();
    const password = pendingSignup?.password || $("authPassword")?.value;
    if (!email || !password) {
      setError(t("gate.resendNeedSignup"), "gate.resendNeedSignup");
      showPanel("auth");
      return;
    }
    try {
      await callFn("requestSignup", { email, password, acceptedLegal: true });
      pendingSignup = { email, password };
      setError("");
      const hint = $("verifyResent");
      if (hint) {
        hint.style.display = "block";
        hint.dataset.errorKey = "gate.resent";
        hint.textContent = t("gate.resent");
      }
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    }
  });

  $("backToAuthBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    showPanel("auth");
  });

  $("setupPinForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const pin = $("setupPin")?.value.trim() || "";
    const confirm = $("setupPinConfirm")?.value.trim() || "";
    if (!/^\d{4}$/.test(pin)) {
      setError(t("admin.pinFourDigits"), "admin.pinFourDigits");
      return;
    }
    if (pin !== confirm) {
      setError(t("admin.pinMismatch"), "admin.pinMismatch");
      return;
    }
    const submit = $("setupPinSubmit");
    if (submit) submit.disabled = true;
    try {
      const res = await callFn("setAdminPin", { pin });
      await routeState(res.data);
    } catch (err) {
      setError(callableErrorMessage(err), callableErrorKey(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("giftContinueBtn")?.addEventListener("click", async () => {
    pendingGiftMessage = false;
    const state = window.__replicaState || (await refreshState());
    await routeState(state);
  });

  $("checkoutMonthlyBtn")?.addEventListener("click", () => startCheckout("monthly"));
  $("checkoutYearlyBtn")?.addEventListener("click", () => startCheckout("yearly"));

  $("kidsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const names = [$("childName1")?.value, $("childName2")?.value, $("childName3")?.value, $("childName4")?.value]
      .map((v) => (v || "").trim())
      .filter(Boolean);
    try {
      const res = await callFn("saveChildren", { childNames: names });
      await routeState(res.data);
    } catch (err) {
      setError(callableErrorMessage(err) || t("err.kids"), callableErrorKey(err) || "err.kids");
    }
  });

  $("logoutBtn")?.addEventListener("click", () => signOut(window.auth));
  $("referralForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const first = $("referralFirst")?.value.trim() || "";
    const last = $("referralLast")?.value.trim() || "";
    await finishReferralPrompt(first || last ? "save" : "skip");
  });
  $("referralSkipBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    finishReferralPrompt("skip");
  });
  $("referralCloseBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    finishReferralPrompt("skip");
  });
  $("portalBtn")?.addEventListener("click", async () => {
    try {
      const res = await callFn("createPortalSession", { origin: location.origin });
      if (res.data?.url) location.href = res.data.url;
    } catch (err) {
      setError(callableErrorMessage(err) || t("err.portal"), callableErrorKey(err) || "err.portal");
    }
  });

  $("exportDataBtn")?.addEventListener("click", () => exportFamilyData());
  $("deleteAccountBtn")?.addEventListener("click", () => deleteFamilyAccount());

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".btn-rename-person");
    if (!btn) return;
    e.preventDefault();
    renamePersonFromBoard(btn);
  });
}

async function renamePersonFromBoard(btn) {
  if (!window.__replicaState?.isOwner || !window.__replicaState?.hasAccess) return;
  const personId = btn.dataset.personId;
  const current = (window.__replicaState?.people || []).find((p) => p.id === personId);
  const next = window.prompt(t("rename.prompt"), current?.name || "");
  if (next == null) return;
  const name = String(next).trim();
  if (!name || name.length > 40) {
    window.alert(t("err.renameLength"));
    return;
  }
  btn.disabled = true;
  try {
    const res = await callFn("renamePerson", { personId, name });
    await applyState(res.data);
    window.startFamilyBoard?.();
  } catch (err) {
    window.alert(callableErrorMessage(err) || t("err.rename"));
  } finally {
    btn.disabled = false;
  }
}

async function startCheckout(plan) {
  setError("");
  if (!$("acceptWithdrawal")?.checked) {
    setError(t("err.acceptedWithdrawal"), "err.acceptedWithdrawal");
    return;
  }
  try {
    await refreshState(plan);
    const res = await callFn("createCheckoutSession", {
      plan,
      origin: location.origin,
      acceptedWithdrawal: true,
    });
    if (res.data?.url) location.href = res.data.url;
  } catch (err) {
    setError(callableErrorMessage(err) || t("err.checkout"), callableErrorKey(err) || "err.checkout");
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportFamilyData() {
  const btn = $("exportDataBtn");
  if (btn) btn.disabled = true;
  try {
    const res = await callFn("exportFamilyData");
    const payload = res.data?.export || res.data;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`systeme-de-recompenses-${stamp}.json`, payload);
  } catch (err) {
    setError(callableErrorMessage(err) || t("err.exportFailed"), callableErrorKey(err) || "err.exportFailed");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteFamilyAccount() {
  if (!window.confirm(t("account.deleteConfirm"))) return;
  const btn = $("deleteAccountBtn");
  if (btn) btn.disabled = true;
  try {
    await callFn("deleteFamilyAccount", { confirm: true });
    await signOut(window.auth);
  } catch (err) {
    setError(callableErrorMessage(err) || t("err.deleteFailed"), callableErrorKey(err) || "err.deleteFailed");
    if (btn) btn.disabled = false;
  }
}

async function handleCheckoutReturn(user) {
  const params = new URLSearchParams(location.search);
  if (params.get("checkout") !== "success") return null;
  const sessionId = params.get("session_id");
  if (sessionId) {
    try {
      const res = await callFn("confirmCheckoutSession", { sessionId });
      history.replaceState({}, "", location.pathname);
      if (res.data?.complimentaryForever) pendingGiftMessage = true;
      return res.data;
    } catch (err) {
      console.warn("confirmCheckoutSession", err);
    }
  }
  history.replaceState({}, "", location.pathname);
  const state = await refreshState();
  if (state?.complimentaryForever) pendingGiftMessage = true;
  return state;
}

export function startReplicaGate() {
  bindUi();
  onLocaleChange(() => {
    syncAuthLabels();
    fillPublicContact();
    accountBar(window.__replicaState, window.auth?.currentUser);
    if (window.__replicaState?.people) renderFamilyShell(window.__replicaState.people);
    renderReferralThanks(window.__replicaState);
    retranslateErrors();
  });
  if (!window.auth) {
    setError(t("err.authMissing"), "err.authMissing");
    setGate(true);
    showPanel("auth");
    return;
  }

  onAuthStateChanged(window.auth, async (user) => {
    setError("");
    if (!user) {
      window.__replicaState = null;
      accountBar(null, null);
      hidePaidOperatorIdentity();
      fillPublicContact();
      setReferralOverlay(false);
      renderReferralThanks(null);
      setGate(true);
      showPanel(pendingSignup ? "verify" : pendingResetEmail ? "resetConfirm" : "auth");
      return;
    }
    try {
      const returned = await handleCheckoutReturn(user);
      const state = returned || (await refreshState());
      await routeState(state);
    } catch (err) {
      setError(callableErrorMessage(err) || t("err.loadFailed"), callableErrorKey(err) || "err.loadFailed");
      setGate(true);
      showPanel("auth");
    }
  });
}
