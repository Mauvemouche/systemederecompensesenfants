import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { renderFamilyShell } from "./family-ui.js";
import { TRIAL_DAYS } from "./stripe-config.js";

const $ = (id) => document.getElementById(id);

function callFn(name, payload) {
  if (!window.functions) throw new Error("Firebase Functions non initialisé");
  return httpsCallable(window.functions, name)(payload);
}

function showPanel(name) {
  ["auth", "checkout", "kids", "blocked"].forEach((key) => {
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

function setError(msg) {
  const el = $("gateError");
  if (!el) return;
  el.textContent = msg || "";
  el.style.display = msg ? "block" : "none";
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
  if (billEl) {
    const status = state?.billing?.status || "";
    const labels = {
      trialing: `Essai (${TRIAL_DAYS} j.)`,
      active: "Abonnement actif",
      past_due: "Paiement en retard",
      incomplete: "Paiement requis",
      canceled: "Annulé",
    };
    billEl.textContent = labels[status] || "";
  }
}

async function applyState(state) {
  window.__replicaState = state;
  if (state?.people) {
    window.applyReplicaFamily?.(state.people);
    renderFamilyShell(state.people);
  }
  accountBar(state, window.auth?.currentUser);
}

async function refreshState(plan) {
  const res = await callFn("bootstrapInstance", { plan });
  const state = res.data;
  await applyState(state);
  return state;
}

function startBoardIfReady(state) {
  if (state?.hasAccess && !state?.needsKids) {
    setGate(false);
    window.startFamilyBoard?.();
    return true;
  }
  return false;
}

async function routeState(state) {
  await applyState(state);
  if (!window.auth?.currentUser) {
    setGate(true);
    showPanel("auth");
    return;
  }
  if (!state.isOwner && state.ownerUid) {
    setGate(true);
    showPanel("blocked");
    $("blockedText").textContent = "Cette instance est déjà liée à un autre parent.";
    return;
  }
  if (state.needsCheckout) {
    setGate(true);
    showPanel("checkout");
    return;
  }
  if (state.needsKids) {
    setGate(true);
    showPanel("kids");
    return;
  }
  startBoardIfReady(state);
}

function bindUi() {
  $("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("");
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const mode = $("authForm").dataset.mode || "login";
    try {
      if (mode === "signup") {
        await createUserWithEmailAndPassword(window.auth, email, password);
      } else {
        await signInWithEmailAndPassword(window.auth, email, password);
      }
    } catch (err) {
      setError(err.message || "Connexion impossible");
    }
  });

  $("toggleAuthMode")?.addEventListener("click", (e) => {
    e.preventDefault();
    const form = $("authForm");
    const signup = form.dataset.mode !== "signup";
    form.dataset.mode = signup ? "signup" : "login";
    $("authSubmit").textContent = signup ? "Créer mon compte" : "Se connecter";
    $("toggleAuthMode").textContent = signup ? "J’ai déjà un compte" : "Créer un compte";
    $("authTitle").textContent = signup ? "Créer le compte parent" : "Connexion parent";
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
      setError(err.message || "Impossible d’enregistrer les prénoms");
    }
  });

  $("logoutBtn")?.addEventListener("click", () => signOut(window.auth));
  $("portalBtn")?.addEventListener("click", async () => {
    try {
      const res = await callFn("createPortalSession", { origin: location.origin });
      if (res.data?.url) location.href = res.data.url;
    } catch (err) {
      setError(err.message || "Portail Stripe indisponible");
    }
  });
}

async function startCheckout(plan) {
  setError("");
  try {
    await refreshState(plan);
    const res = await callFn("createCheckoutSession", { plan, origin: location.origin });
    if (res.data?.url) location.href = res.data.url;
  } catch (err) {
    setError(err.message || "Checkout Stripe impossible");
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
      return res.data;
    } catch (err) {
      console.warn("confirmCheckoutSession", err);
    }
  }
  history.replaceState({}, "", location.pathname);
  return refreshState();
}

export function startReplicaGate() {
  bindUi();
  if (!window.auth) {
    setError("Firebase Auth n’est pas initialisé. Vérifie replica/public/js/firebase-config.js");
    setGate(true);
    showPanel("auth");
    return;
  }

  onAuthStateChanged(window.auth, async (user) => {
    setError("");
    if (!user) {
      window.__replicaState = null;
      accountBar(null, null);
      setGate(true);
      showPanel("auth");
      return;
    }
    try {
      const returned = await handleCheckoutReturn(user);
      const state = returned || (await refreshState());
      await routeState(state);
    } catch (err) {
      setError(err.message || "Impossible de charger cette instance");
      setGate(true);
      showPanel("auth");
    }
  });
}
