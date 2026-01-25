import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   CONFIG / GLOBAL
========================================================= */
const PEOPLE = ["papa", "maman", "florent", "harry"];
const CHILDREN = new Set(["florent", "harry"]);
const ADMIN_PIN = "1571";

let unsubscribe = null;
let currentFilter = "all";
let isAdminMode = false;

// Day navigation
let selectedDay = null; // null = today
const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Drag & drop state
let draggedEl = null;

/* =========================================================
   INIT
========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  if (!window.db) {
    console.error("window.db missing. Check firebase init in index.html.");
    showNotification("Firebase non initialisé", "error");
    return;
  }

  setupEvents();
  updateDayDisplay();

  if (sessionStorage.getItem("isAdminMode") === "true") enableAdmin(false);

  loadTasks();
});

/* =========================================================
   EVENTS
========================================================= */
function setupEvents() {
  // Toggle form (OUVERTURE uniquement via le bandeau)
  const toggle = document.getElementById("toggleFormBtn");
  const form = document.getElementById("taskForm");

  toggle?.addEventListener("click", () => {
    if (!form) return;

    if (form.classList.contains("hidden")) {
      form.classList.remove("hidden");
      toggle.setAttribute("aria-expanded", "true");

      setTimeout(() => {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("taskTitle")?.focus();
      }, 50);
    }
  });

  // Bouton Annuler = SEULE façon de fermer
  document.getElementById("cancelFormBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // 🔑 empêche le toggle du bandeau
    resetAndCloseForm();
  });

  // Esc ferme aussi (bonus UX)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") resetAndCloseForm();
  })
    ;

  // Submit form
  document.getElementById("taskForm")?.addEventListener("submit", submitTask);

  // Filters
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      currentFilter = e.target.dataset.filter;
      applyFilter();
    });
  });

  // Admin button
  document.getElementById("adminModeBtn")?.addEventListener("click", toggleAdmin);

  // Refresh button (robust, no inline onclick)
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    location.reload();
  });

  // Refresh / debug
  window.toggleDebugAndRefresh = () => {
    if (isAdminMode) {
      const panel = document.getElementById("debugPanel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }
    loadTasks();
  };
  window.clearDebugLogs = () => {
    const logs = document.getElementById("debugLogs");
    if (logs) logs.innerHTML = "";
  };

  // Category logic (add form)
  document.getElementById("category")?.addEventListener("change", (e) => {
    const val = e.target.value;
    const specific = document.getElementById("specificDateGroup");
    const daysGroup = document.getElementById("daysSelectionGroup");
    const dateLabel = document.getElementById("dateLabel");

    if (val === "ponctuel" || val === "mensuel") {
      if (specific) specific.style.display = "block";
      if (daysGroup) daysGroup.style.display = "none";
      if (dateLabel) dateLabel.textContent = val === "mensuel" ? "Date du mois concerné" : "Date spécifique";
    } else if (val === "hebdomadaire") {
      if (specific) specific.style.display = "none";
      if (daysGroup) daysGroup.style.display = "none";
    } else {
      if (specific) specific.style.display = "none";
      if (daysGroup) daysGroup.style.display = "block";
    }
  });

  // allDays toggle
  document.getElementById("allDays")?.addEventListener("change", (e) => {
    const checked = e.target.checked;
    for (let i = 0; i <= 6; i++) {
      const cb = document.getElementById(`day${i}`);
      if (cb) cb.checked = checked;
    }
  });

  // update allDays if user changes one day
  for (let i = 0; i <= 6; i++) {
    document.getElementById(`day${i}`)?.addEventListener("change", () => {
      const all = document.getElementById("allDays");
      if (!all) return;
      const every = [...Array(7)].every((_, idx) => document.getElementById(`day${idx}`)?.checked);
      all.checked = every;
    });
  }

  // Modal events (edit)
  bindEditModalOnce();

  /* ===== Admin PIN modal events ===== */
  const pinForm = document.getElementById("adminPinForm");
  const pinClose = document.getElementById("adminPinCloseBtn");
  const pinCancel = document.getElementById("adminPinCancelBtn");
  const pinOverlay = document.getElementById("adminPinOverlay");
  const pinError = document.getElementById("adminPinError");

  pinClose?.addEventListener("click", closeAdminPinModal);
  pinCancel?.addEventListener("click", closeAdminPinModal);

  pinOverlay?.addEventListener("click", (e) => {
    if (e.target === pinOverlay) closeAdminPinModal();
  });

  pinForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const value = document.getElementById("adminPinInput")?.value?.trim() || "";
    if (value === ADMIN_PIN) {
      if (pinError) pinError.style.display = "none";
      closeAdminPinModal();
      enableAdmin(true);
    } else {
      if (pinError) pinError.style.display = "block";
    }
  });
}


/* =========================================================
   DAY NAV (globals used by inline onclick)
========================================================= */
function getTodayDow() {
  return new Date().getDay();
}
function getCurrentDow() {
  return selectedDay ?? getTodayDow();
}
function isToday() {
  return selectedDay === null || selectedDay === getTodayDow();
}

function computeSelectedDate() {
  const now = new Date();
  const offset = getCurrentDow() - getTodayDow();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(now.getDate() + offset);
  return d;
}

function updateDayDisplay() {
  const d = computeSelectedDate();
  const title = document.getElementById("dayNavigationTitle");
  if (title) {
    title.textContent = `📅 ${dayNames[getCurrentDow()].toUpperCase()} ${d.toLocaleDateString("fr-FR")}`;
  }

  const prev = (getCurrentDow() + 6) % 7;
  const next = (getCurrentDow() + 1) % 7;
  const prevName = document.getElementById("prevDayName");
  const nextName = document.getElementById("nextDayName");
  if (prevName) prevName.textContent = dayNames[prev];
  if (nextName) nextName.textContent = dayNames[next];

  for (let i = 0; i <= 6; i++) {
    document.getElementById(`dayBtn${i}`)?.classList.toggle("active", i === getCurrentDow());
  }

  const banner = document.getElementById("dayWarningBanner");
  if (banner) {
    banner.classList.toggle("hidden", isToday());
    if (!isToday()) {
      const warningDayName = document.getElementById("warningDayName");
      const warningTodayName = document.getElementById("warningTodayName");
      const today = new Date();
      const todayStr = today.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      const selStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      if (warningDayName) warningDayName.textContent = `${dayNames[getCurrentDow()].toUpperCase()} ${selStr}`;
      if (warningTodayName) warningTodayName.textContent = `${dayNames[getTodayDow()]} ${todayStr}`;
    }
  }
}

window.changeDay = (day) => {
  selectedDay = day;
  updateDayDisplay();
  loadTasks();
};
window.previousDay = () => window.changeDay((getCurrentDow() + 6) % 7);
window.nextDay = () => window.changeDay((getCurrentDow() + 1) % 7);
window.goToToday = () => {
  selectedDay = null;
  updateDayDisplay();
  loadTasks();
};

/* =========================================================
   ADMIN
========================================================= */
function toggleAdmin() {
  if (isAdminMode) return disableAdmin();
  openAdminPinModal();
}

function enableAdmin(toast = true) {
  isAdminMode = true;
  sessionStorage.setItem("isAdminMode", "true");
  document.querySelector(".container")?.classList.add("admin-mode-active");

  const btn = document.getElementById("adminModeBtn");
  if (btn) {
    btn.textContent = "🔓";
    btn.classList.add("active");
  }

  if (toast) showNotification("✅ Mode Admin activé", "success");
}

function disableAdmin() {
  isAdminMode = false;
  sessionStorage.removeItem("isAdminMode");
  document.querySelector(".container")?.classList.remove("admin-mode-active");

  const btn = document.getElementById("adminModeBtn");
  if (btn) {
    btn.textContent = "🔒";
    btn.classList.remove("active");
  }

  const debugPanel = document.getElementById("debugPanel");
  if (debugPanel) debugPanel.style.display = "none";

  showNotification("🔒 Mode Admin désactivé", "info");
}

/* =========================================================
   LOAD TASKS (REALTIME) ✅ NO orderBy => NO index required
========================================================= */
function loadTasks() {
  unsubscribe?.();

  // ✅ On écoute TOUTES les tâches, puis on filtre côté client.
  // Avantage: mensuel/ponctuel restent corrects même quand le jour de semaine change.
  const q = query(collection(window.db, "tasks"));

  unsubscribe = onSnapshot(
    q,
    (snap) => {
      const tasks = [];
      snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));
      renderTasks(tasks);
    },
    (err) => {
      console.error("Firestore load error:", err);
      showNotification("Erreur lors du chargement", "error");
    }
  );
}

/* =========================================================
   RENDER
========================================================= */
function renderTasks(rawTasks) {
  const date = computeSelectedDate();
  const ymd = toYMD(date);

  // local sorting
  rawTasks.sort((a, b) => {
    const pa = a.assignedTo || "";
    const pb = b.assignedTo || "";
    if (pa !== pb) return pa.localeCompare(pb);

    const oa = a.order ?? 999999;
    const ob = b.order ?? 999999;
    if (oa !== ob) return oa - ob;

    const ca = a.createdAt?.seconds ?? 0;
    const cb = b.createdAt?.seconds ?? 0;
    return ca - cb;
  });

  // ✅ Filtre d'affichage (quotidien/hebdo/mensuel/ponctuel) côté client
  const tasks = rawTasks.filter((t) => taskAppliesToDate(t, date));
  // clear lists

  PEOPLE.forEach((p) => {
    const el = document.getElementById(`tasks-${p}`);
    if (el) el.innerHTML = "";
  });

  // stats
  const stats = {};
  PEOPLE.forEach((p) => {
    stats[p] = {
      normalTotal: 0,
      normalEarned: 0,
      bonusStars: 0,
      penaltyStars: 0,
      seriousFault: false,
      tasksCount: 0
    };
  });

  // group by person
  const byPerson = { papa: [], maman: [], florent: [], harry: [] };
  tasks.forEach((t) => {
    if (byPerson[t.assignedTo]) byPerson[t.assignedTo].push(t);
  });

  // render + compute base totals
  PEOPLE.forEach((person) => {
    const list = byPerson[person] || [];
    stats[person].tasksCount = list.length;

    const container = document.getElementById(`tasks-${person}`);
    if (!container) return;

    list.forEach((t) => {
      container.appendChild(createTaskElement(t));

      const s = stats[person];
      const stars = Math.abs(Number(t.stars || 3));

      if (t.isSeriousFault && t.completed) s.seriousFault = true;

      if (t.isPenalty) {
        if (t.completed) s.penaltyStars += Math.abs(stars);
        return;
      }

      // ✅ normal = ni bonus, ni pénalité, ni faute grave
      if (!t.isBonus && !t.isSeriousFault) {
        s.normalTotal += stars;
        if (t.completed) s.normalEarned += stars;
      }

    });
  });

  // bonus stars only if 100% normal achieved (YOUR RULE)
  PEOPLE.forEach((person) => {
    const s = stats[person];
    const allowBonus = s.normalTotal === 0 || s.normalEarned === s.normalTotal;

    (byPerson[person] || []).forEach((t) => {
      if (!t.isBonus || !t.completed) return;
      if (!allowBonus) return;
      s.bonusStars += Math.abs(Number(t.stars || 3));
    });
  });

  // update UI
  PEOPLE.forEach((person) => {
    const s = stats[person];

    // ✅ garder /0 si aucune tâche
    const normalMax = s.normalTotal; // peut être 0

    let earnedStars;
    if (s.seriousFault) {
      earnedStars = 0; // ✅ faute grave => score du jour nul (persistant)
    } else {
      earnedStars = (s.normalEarned + s.bonusStars) - s.penaltyStars; // ✅ pénalité = négatif
    };

    const starsEl = document.getElementById(`stars-count-${person}`);
    if (starsEl) starsEl.innerHTML = `${earnedStars} <span style="opacity:.6">/ ${normalMax}</span>`;

    const countEl = document.getElementById(`tasks-count-${person}`);
    if (countEl) countEl.textContent = String(s.tasksCount);

    // ✅ éviter division par zéro
    const percent = normalMax === 0 ? 0 : Math.round((earnedStars / normalMax) * 100);
    const percentEl = document.getElementById(`percentage-${person}`);
    if (percentEl) percentEl.textContent = `${percent}%`;

    const fill = document.getElementById(`progress-fill-${person}`);
    if (fill) fill.style.width = `${Math.max(0, Math.min(160, percent))}%`;


    // ---------------------------
    // Screen time: children only
    // ---------------------------
    const baseTimeEl = document.getElementById(`base-time-${person}`);
    const badgeEl = document.getElementById(`screen-time-badge-${person}`);
    const bonusTimeEl = document.getElementById(`bonus-time-${person}`);
    const giftEl = document.getElementById(`gift-time-${person}`);

    let bonusMin = 0;

    if (CHILDREN.has(person)) {
      // 💀 Faute grave => temps = 0 pour la journée
      if (s.seriousFault) {
        bonusMin = 0;
        const baseMin = 0;
        const totalMin = 0;

        setText(`base-minutes-${person}`, baseMin);
        setText(`screen-minutes-${person}`, totalMin);
        setText(`bonus-minutes-${person}`, bonusMin);
        setText(`total-minutes-${person}`, totalMin);
        setText(`gift-minutes-${person}`, bonusMin);

      } else {
        // ✅ Base impactée par pénalités
        const netNormalEarned = Math.max(0, s.normalEarned - s.penaltyStars);
        const baseRatio = normalMax === 0 ? 0 : (netNormalEarned / normalMax);
        const baseMin = Math.round(baseRatio * 20);

        // 🎁 Bonus autorisé seulement si 100% normal (ou pas de tâches)
        const allowBonus = (s.normalTotal === 0) || (s.normalEarned === s.normalTotal);
        bonusMin = allowBonus ? s.bonusStars : 0;

        const totalMin = baseMin + bonusMin;

        setText(`base-minutes-${person}`, baseMin);
        setText(`screen-minutes-${person}`, totalMin);
        setText(`bonus-minutes-${person}`, bonusMin);
        setText(`total-minutes-${person}`, totalMin);
        setText(`gift-minutes-${person}`, bonusMin);
      }

      // Gift badge
      
      if (giftEl) {
        const isActive = bonusMin > 0;

        giftEl.style.display = "inline-flex";
        giftEl.classList.toggle("active", isActive);

        // ✅ Intent utilisateur (cochage bonus) = SEUL déclencheur
        const intent = window.__bonusAnimIntent;
        const okIntent =
          intent &&
          intent.person === person &&
          intent.day === getCurrentDow() &&
          (Date.now() - intent.ts) < 8000;

        // Anti double-trigger si renderTasks() est appelé 2x
        const key = okIntent ? `${intent.person}-${intent.day}-${intent.ts}` : null;
        if (key && window.__lastBonusAnimKey === key) {
          window.__bonusAnimIntent = null;
        }

        // ✅ On déclenche seulement si: action utilisateur récente + bonus réellement >0
        if (okIntent && isActive && window.__lastBonusAnimKey !== key) {
          window.__lastBonusAnimKey = key;
          window.__bonusAnimIntent = null; // consomme l’intent

          if (!window.__confettiScrollLock) {
            window.__confettiScrollLock = true;

            const scrollTarget = document.querySelector(".main-header") || document.body;

            scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });

            setTimeout(() => {
              giftEl.classList.add("pop");
              setTimeout(() => giftEl.classList.remove("pop"), 220);

              if (typeof spawnConfettiBurst === "function") {
                spawnConfettiBurst(giftEl, 110);
              }

              setTimeout(() => { window.__confettiScrollLock = false; }, 400);
            }, 2000);

          } else {
            // déjà en cours : pop + confettis sans scroll
            giftEl.classList.add("pop");
            setTimeout(() => giftEl.classList.remove("pop"), 220);

            if (typeof spawnConfettiBurst === "function") {
              spawnConfettiBurst(giftEl, 110);
            }

            setTimeout(() => { window.__confettiScrollLock = false; }, 400);
          }
        }
      } // ✅ ferme if (giftEl)

      if (baseTimeEl) baseTimeEl.style.display = "inline-flex";
      if (badgeEl) badgeEl.style.display = "inline-flex";
      if (bonusTimeEl) bonusTimeEl.style.display = bonusMin > 0 ? "inline" : "none";
    } else {
      if (baseTimeEl) baseTimeEl.style.display = "none";
      if (badgeEl) badgeEl.style.display = "none";
      if (bonusTimeEl) bonusTimeEl.style.display = "none";
      if (giftEl) giftEl.style.display = "none";
    }
  });

  applyFilter();
}
// ✅ FIN de renderTasks

function createTaskElement(t) {
  const div = document.createElement("div");
  div.className = `task-item ${t.completed ? "completed" : ""}`;
  div.dataset.taskId = t.id;
  div.dataset.assignedTo = t.assignedTo;
  div.draggable = true;

  if (t.isBonus) div.classList.add("bonus");
  if (t.isPenalty) div.classList.add("penalty");
  if (t.isSeriousFault) div.classList.add("serious-fault");

  const rawStars = Number(t.stars || 3);
  const absStars = Math.abs(rawStars);
  const starsDisplay = t.isPenalty ? `-${absStars}⭐` : `⭐ ${absStars}`;

  const badges = [
    t.isBonus ? `<span class="badge badge-bonus">🎁 BONUS</span>` : "",
    t.isPenalty ? `<span class="badge badge-penalty">⛔ PÉNALITÉ</span>` : "",
    t.isSeriousFault ? `<span class="badge badge-fault">💀 FAUTE GRAVE</span>` : ""
  ].join("");

  const meta = [
    `<span class="task-category">${escapeHtml(t.category || "")}</span>`,
    `<span class="task-stars">${starsDisplay}</span>`,
    t.fullDate ? `<span class="badge" style="background:#eee;color:#333;">📅 ${escapeHtml(t.fullDate)}</span>` : "",
    t.dayOfMonth ? `<span class="badge" style="background:#eee;color:#333;">🗓️ ${escapeHtml(String(t.dayOfMonth))}</span>` : ""
  ].join("");

  div.innerHTML = `
    <div class="task-header">
      <div class="drag-handle" title="Glisser pour réorganiser">⋮⋮</div>
      <div class="checkbox ${t.completed ? "checked" : ""}" title="Cocher / décocher"></div>
      <div class="task-content">
        <div class="task-title">${escapeHtml(t.title || "")} ${badges}</div>
        ${t.description ? `<div style="color:#555; font-weight:700; padding-left:2px;">${escapeHtml(t.description)}</div>` : ""}
        <div class="task-meta">${meta}</div>
      </div>
    </div>

    <div class="task-actions">
      <button class="btn-edit" type="button">✏️ Modifier</button>
      <button class="btn-delete" type="button">🗑️ Supprimer</button>
    </div>
  `;

  // Toggle completion
  div.querySelector(".checkbox")?.addEventListener("click", () => {
    const nextCompleted = !t.completed;

    // ✅ marque que l'utilisateur vient de cocher un bonus (pour autoriser l'animation)
    if (t.isBonus && nextCompleted) {
      window.__bonusAnimIntent = {
        person: t.assignedTo,
        day: getCurrentDow(),
        ts: Date.now()
      };
    }

    toggleTaskCompletion(t.id, nextCompleted);
  });

  // Admin actions
  div.querySelector(".btn-delete")?.addEventListener("click", () => deleteTask(t.id));
  div.querySelector(".btn-edit")?.addEventListener("click", () => editTask(t.id));

  // Drag & drop
  div.addEventListener("dragstart", onDragStart);
  div.addEventListener("dragover", onDragOver);
  div.addEventListener("drop", onDrop);
  div.addEventListener("dragend", onDragEnd);

  return div;
}

async function toggleTaskCompletion(taskId, completed) {
  try {
    await updateDoc(doc(window.db, "tasks", taskId), { completed, updatedAt: serverTimestamp() });
  } catch (e) {
    console.error(e);
    showNotification("Erreur mise à jour", "error");
  }
}

async function deleteTask(taskId) {
  if (!isAdminMode) return showNotification("Mode admin requis", "error");
  if (!confirm("Supprimer cette tâche ?")) return;

  try {
    await deleteDoc(doc(window.db, "tasks", taskId));
    showNotification("Tâche supprimée", "success");
  } catch (e) {
    console.error(e);
    showNotification("Erreur suppression", "error");
  }
}

/* ---------- Drag & drop ordering ---------- */
function onDragStart(e) {
  draggedEl = e.currentTarget;
  draggedEl.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
async function onDrop(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!draggedEl || !target) return;

  if (draggedEl.dataset.assignedTo !== target.dataset.assignedTo) return;
  if (draggedEl === target) return;

  const container = target.parentNode;
  const items = Array.from(container.querySelectorAll(".task-item"));
  const draggedIndex = items.indexOf(draggedEl);
  const targetIndex = items.indexOf(target);

  if (draggedIndex < targetIndex) container.insertBefore(draggedEl, target.nextSibling);
  else container.insertBefore(draggedEl, target);

  await updateOrders(container);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  draggedEl = null;
}

async function updateOrders(container) {
  const items = Array.from(container.querySelectorAll(".task-item"));
  const writes = items.map((el, idx) =>
    updateDoc(doc(window.db, "tasks", el.dataset.taskId), { order: idx, updatedAt: serverTimestamp() })
  );
  try {
    await Promise.all(writes);
  } catch (e) {
    console.error(e);
    showNotification("Erreur réorganisation", "error");
  }
}

/* =========================================================
   ADMIN BULK ACTIONS (called from HTML)
========================================================= */
window.checkAllTasks = async function (person, completed) {
  if (!isAdminMode) return showNotification("Mode admin requis", "error");
  if (!confirm(`${completed ? "Cocher" : "Décocher"} toutes les tâches de ${person} (jour affiché) ?`)) return;

  try {
    // ✅ On charge les tâches de la personne puis on filtre côté client (mensuel/ponctuel inclus)
    const snap = await getDocs(query(collection(window.db, "tasks"), where("assignedTo", "==", person)));

    const date = computeSelectedDate();
    const writes = [];
    snap.forEach((d) => {
      const t = d.data();
      if (!taskAppliesToDate(t, date)) return;
      writes.push(updateDoc(doc(window.db, "tasks", d.id), { completed, updatedAt: serverTimestamp() }));
    });

    if (writes.length === 0) return showNotification("Aucune tâche à modifier", "info");

    await Promise.all(writes);
    showNotification("✅ OK", "success");
  } catch (e) {
    console.error(e);
    showNotification("Erreur", "error");
  }
};

window.resetPersonTasks = async function (person) {
  return window.checkAllTasks(person, false);
};

/* =========================================================
   ADD TASK (recurrence)
========================================================= */
async function submitTask(e) {
  e.preventDefault();

  const title = document.getElementById("taskTitle")?.value?.trim() || "";
  const description = document.getElementById("taskDescription")?.value?.trim() || "";
  const assignedTo = document.getElementById("assignedTo")?.value || "";
  const stars = parseInt(document.getElementById("stars")?.value || "3", 10);
  const category = document.getElementById("category")?.value || "quotidien";

  const isBonus = (document.getElementById("isBonus")?.checked || /bonus/i.test(title));
  const isPenalty = !!document.getElementById("isPenalty")?.checked;
  const isSeriousFault = !!document.getElementById("isSeriousFault")?.checked;

  if (!title || !assignedTo) return showNotification("Titre + personne obligatoires", "error");

  // ✅ 1 templateId pour toutes les occurrences (sauf ponctuel : pas grave si présent)
  const templateId = newTemplateId();

  try {
    const base = {
      templateId,
      title,
      description,
      assignedTo,
      stars: Number.isFinite(stars) ? stars : 3,
      category,
      isBonus,
      isPenalty,
      isSeriousFault,
      completed: false,
      // order: on évite des requêtes supplémentaires => tri stable via timestamp
      order: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // hebdomadaire => dimanche
    if (category === "hebdomadaire") {
      await addDoc(collection(window.db, "tasks"), {
        ...base,
        dayOfWeek: 0,
        fullDate: null,
        dayOfMonth: null
      });
      resetAndCloseForm();
      showNotification("✅ Tâche hebdomadaire ajoutée (Dimanche)", "success");
      return;
    }

    // ponctuel / mensuel => specificDate
    if (category === "ponctuel" || category === "mensuel") {
      const dateVal = document.getElementById("specificDate")?.value;
      if (!dateVal) return showNotification("Sélectionne une date", "error");
      const d = new Date(dateVal);

      await addDoc(collection(window.db, "tasks"), {
        ...base,
        // dayOfWeek n'est plus utilisé pour mensuel/ponctuel mais on le garde pour compat
        dayOfWeek: -1,
        fullDate: category === "ponctuel" ? dateVal : null,
        dayOfMonth: category === "mensuel" ? d.getDate() : null
      });

      resetAndCloseForm();
      showNotification("✅ Tâche ajoutée", "success");
      return;
    }

    // quotidien => jours cochés
    const selectedDays = [];
    for (let i = 0; i <= 6; i++) {
      if (document.getElementById(`day${i}`)?.checked) selectedDays.push(i);
    }
    if (selectedDays.length === 0) return showNotification("Choisis au moins un jour", "error");

    await Promise.all(
      selectedDays.map((day, idx) =>
        addDoc(collection(window.db, "tasks"), {
          ...base,
          category: "quotidien",
          dayOfWeek: day,
          fullDate: null,
          dayOfMonth: null,
          order: base.order + idx
        })
      )
    );

    resetAndCloseForm();
    showNotification(`✅ Tâche ajoutée (${selectedDays.length} jour(s))`, "success");
  } catch (err) {
    console.error(err);
    showNotification("Erreur ajout tâche", "error");
  }
}

function resetAndCloseForm() {
  const form = document.getElementById("taskForm");
  if (!form) return;

  form.reset();
  form.classList.add("hidden");

  const specific = document.getElementById("specificDateGroup");
  const daysGroup = document.getElementById("daysSelectionGroup");
  if (specific) specific.style.display = "none";
  if (daysGroup) daysGroup.style.display = "block";

  const all = document.getElementById("allDays");
  if (all) all.checked = true;
  for (let i = 0; i <= 6; i++) {
    const cb = document.getElementById(`day${i}`);
    if (cb) cb.checked = true;
  }
}

/* =========================================================
   FILTER
========================================================= */
function applyFilter() {
  document.querySelectorAll(".person-section").forEach((sec) => {
    const p = sec.dataset.person;
    sec.classList.toggle("hidden", !(currentFilter === "all" || p === currentFilter));
  });
}

/* =========================================================
   MODAL EDIT (no prompt)
========================================================= */
let editModalBound = false;

function bindEditModalOnce() {
  if (editModalBound) return;
  editModalBound = true;

  const overlay = document.getElementById("editModalOverlay");
  const closeBtn = document.getElementById("editModalCloseBtn");
  const cancelBtn = document.getElementById("editCancelBtn");
  const form = document.getElementById("editTaskForm");
  const category = document.getElementById("editCategory");

  const close = () => closeEditModal();

  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  category?.addEventListener("change", () => {
    syncEditDateUI();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveEditModal();
  });
}

function openEditModalWithTask(taskId, taskData) {
  document.getElementById("editTaskId").value = taskId;
  document.getElementById("editTitle").value = taskData.title ?? "";
  document.getElementById("editDescription").value = taskData.description ?? "";
  document.getElementById("editStars").value = String(taskData.stars ?? 3);
  document.getElementById("editCategory").value = taskData.category ?? "quotidien";
  document.getElementById("editIsBonus").checked = !!taskData.isBonus;
  document.getElementById("editIsPenalty").checked = !!taskData.isPenalty;
  document.getElementById("editIsSeriousFault").checked = !!taskData.isSeriousFault;

  // date input: keep fullDate if ponctuel
  const d = document.getElementById("editSpecificDate");
  d.value = taskData.fullDate ?? "";

  syncEditDateUI(taskData);

  const overlay = document.getElementById("editModalOverlay");
  // ✅ on garde les infos de récurrence pour saveEditModal()
  overlay.dataset.templateId = taskData.templateId || "";
  overlay.dataset.originalCategory = (taskData.category ?? "quotidien").toLowerCase();
  overlay.dataset.assignedTo = taskData.assignedTo || "";

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  setTimeout(() => document.getElementById("editTitle")?.focus(), 50);
}

function closeEditModal() {
  const overlay = document.getElementById("editModalOverlay");
  overlay?.classList.add("hidden");
  overlay?.setAttribute("aria-hidden", "true");
}

function syncEditDateUI(taskData = null) {
  const cat = document.getElementById("editCategory").value;
  const block = document.getElementById("editDateBlock");
  const label = document.getElementById("editDateLabel");

  const show = cat === "ponctuel" || cat === "mensuel";
  block.classList.toggle("hidden", !show);
  if (label) label.textContent = cat === "mensuel" ? "Date du mois concerné" : "Date spécifique";

  if (taskData && taskData.category === "ponctuel" && taskData.fullDate) {
    document.getElementById("editSpecificDate").value = taskData.fullDate;
  }
}

async function saveEditModal() {
  const id = document.getElementById("editTaskId").value;
  const title = document.getElementById("editTitle").value.trim();
  const description = document.getElementById("editDescription").value.trim();
  const stars = Math.max(1, Math.min(5, parseInt(document.getElementById("editStars").value, 10) || 3));
  const newCategory = (document.getElementById("editCategory").value || "quotidien").toLowerCase();

  const isBonusChecked = document.getElementById("editIsBonus").checked;
  const isPenalty = document.getElementById("editIsPenalty").checked;
  const isSeriousFault = document.getElementById("editIsSeriousFault").checked;

  const bonusFromTitle = /bonus/i.test(title);
  const isBonus = isBonusChecked || bonusFromTitle;

  const overlay = document.getElementById("editModalOverlay");
  const originalCategory = (overlay?.dataset.originalCategory || "quotidien").toLowerCase();
  let templateId = overlay?.dataset.templateId || "";

  try {
    // ✅ si pas de templateId, on en crée un pour ce doc (au moins pour le futur)
    if (!templateId) {
      templateId = id; // stable
      await updateDoc(doc(window.db, "tasks", id), { templateId });
      overlay.dataset.templateId = templateId;
    }

    const commonFields = {
      title,
      description,
      stars,
      category: newCategory,
      isBonus,
      isPenalty,
      isSeriousFault,
      updatedAt: serverTimestamp()
    };

    // ====== helpers ======
    const getGroupDocs = async () => {
      const q = query(collection(window.db, "tasks"), where("templateId", "==", templateId));
      const snap = await getDocs(q);
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      return docs;
    };

    const deleteGroup = async (docs) => {
      const deletes = docs.map((t) => deleteDoc(doc(window.db, "tasks", t.id)));
      await Promise.all(deletes);
    };

    const createForDays = async (days) => {
      // on remet à zéro les occurrences (completed=false)
      const base = {
        templateId,
        title,
        description,
        assignedTo: overlay?.dataset.assignedTo || (await getDoc(doc(window.db, "tasks", id))).data().assignedTo,
        stars,
        isBonus,
        isPenalty,
        isSeriousFault,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // ordre: stable sans requêtes
      const baseOrder = Date.now();

      await Promise.all(
        days.map((day, idx) =>
          addDoc(collection(window.db, "tasks"), {
            ...base,
            category: "quotidien",
            dayOfWeek: day,
            fullDate: null,
            dayOfMonth: null,
            order: baseOrder + idx
          })
        )
      );
    };

    const createWeekly = async () => {
      const base = {
        templateId,
        title,
        description,
        assignedTo: overlay?.dataset.assignedTo || (await getDoc(doc(window.db, "tasks", id))).data().assignedTo,
        stars,
        isBonus,
        isPenalty,
        isSeriousFault,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: Date.now()
      };

      await addDoc(collection(window.db, "tasks"), {
        ...base,
        category: "hebdomadaire",
        dayOfWeek: 0,
        fullDate: null,
        dayOfMonth: null
      });
    };

    const createMonthly = async () => {
      const dateVal = document.getElementById("editSpecificDate").value;
      if (!dateVal) return showNotification("Sélectionne une date", "error");
      const d = new Date(dateVal);

      const base = {
        templateId,
        title,
        description,
        assignedTo: overlay?.dataset.assignedTo || (await getDoc(doc(window.db, "tasks", id))).data().assignedTo,
        stars,
        isBonus,
        isPenalty,
        isSeriousFault,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: Date.now()
      };

      await addDoc(collection(window.db, "tasks"), {
        ...base,
        category: "mensuel",
        dayOfWeek: -1,
        fullDate: null,
        dayOfMonth: d.getDate()
      });
    };

    const createPonctuel = async () => {
      const dateVal = document.getElementById("editSpecificDate").value;
      if (!dateVal) return showNotification("Sélectionne une date", "error");

      const base = {
        templateId,
        title,
        description,
        assignedTo: overlay?.dataset.assignedTo || (await getDoc(doc(window.db, "tasks", id))).data().assignedTo,
        stars,
        isBonus,
        isPenalty,
        isSeriousFault,
        completed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        order: Date.now()
      };

      await addDoc(collection(window.db, "tasks"), {
        ...base,
        category: "ponctuel",
        dayOfWeek: -1,
        fullDate: dateVal,
        dayOfMonth: null
      });
    };

    // ====== CASE 1: catégorie inchangée ======
    if (newCategory === originalCategory) {
      // ponctuel: juste le doc
      if (newCategory === "ponctuel") {
        const payload = { ...commonFields };

        // date update (ponctuel)
        const dateVal = document.getElementById("editSpecificDate").value;
        if (!dateVal) return showNotification("Sélectionne une date", "error");
        payload.fullDate = dateVal;
        payload.dayOfMonth = null;
        payload.dayOfWeek = -1;

        await updateDoc(doc(window.db, "tasks", id), payload);
        closeEditModal();
        showNotification("✅ Tâche modifiée", "success");
        return;
      }

      // mensuel: mettre à jour le dayOfMonth si on a choisi une date
      const groupDocs = await getGroupDocs();
      const writes = [];

      let recurrencePatch = {};
      if (newCategory === "mensuel") {
        const dateVal = document.getElementById("editSpecificDate").value;
        if (dateVal) {
          const d = new Date(dateVal);
          recurrencePatch = { dayOfMonth: d.getDate(), fullDate: null, dayOfWeek: -1 };
        }
      } else if (newCategory === "hebdomadaire") {
        recurrencePatch = { dayOfWeek: 0, fullDate: null, dayOfMonth: null };
      } else {
        // quotidien: on ne touche pas dayOfWeek sur chaque doc
        recurrencePatch = {};
      }

      groupDocs.forEach((t) => {
        const payload = { ...commonFields, ...recurrencePatch };
        // ✅ on ne force jamais completed/order ici
        delete payload.completed;
        delete payload.order;
        writes.push(updateDoc(doc(window.db, "tasks", t.id), payload));
      });

      await Promise.all(writes);

      closeEditModal();
      showNotification("✅ Tâche modifiée (récurrence mise à jour)", "success");
      return;
    }

    // ====== CASE 2: catégorie changée => RECONSTRUIRE la récurrence ======
    // Règles demandées :
    // - vers "quotidien" => copies Dim→Sam (on ignore dimanche/jour du mois d'origine)
    // - vers "ponctuel" => efface toute récurrence et ne garde qu'un one-off
    // - vers "hebdomadaire" ou "mensuel" => efface toutes les copies et garde 1 seule occurrence

    const groupDocs = await getGroupDocs();
    await deleteGroup(groupDocs);

    if (newCategory === "quotidien") {
      await createForDays([0, 1, 2, 3, 4, 5, 6]);
    } else if (newCategory === "hebdomadaire") {
      await createWeekly();
    } else if (newCategory === "mensuel") {
      await createMonthly();
    } else if (newCategory === "ponctuel") {
      await createPonctuel();
    } else {
      // fallback: quotidien
      await createForDays([0, 1, 2, 3, 4, 5, 6]);
    }

    closeEditModal();
    showNotification("✅ Récurrence mise à jour", "success");
  } catch (e) {
    console.error(e);
    showNotification("Erreur édition", "error");
  }
}

async function editTask(taskId) {
  if (!isAdminMode) return showNotification("Mode admin requis", "error");

  try {
    const snap = await getDoc(doc(window.db, "tasks", taskId));
    if (!snap.exists()) return showNotification("Tâche introuvable", "error");
    openEditModalWithTask(taskId, snap.data());
  } catch (e) {
    console.error(e);
    showNotification("Erreur édition", "error");
  }
}

/* =========================================================
   DEBUG / NOTIFICATION / UTILS
========================================================= */

function taskAppliesToDate(t, date) {
  const ymd = toYMD(date);
  const dow = date.getDay();
  const dom = date.getDate();
  const cat = (t.category || "quotidien").toLowerCase();

  if (cat === "ponctuel") return t.fullDate === ymd;
  if (cat === "mensuel") return Number(t.dayOfMonth) === dom;
  if (cat === "hebdomadaire") return dow === 0; // hebdo = dimanche
  // quotidien (par défaut)
  return Number(t.dayOfWeek) === dow;
}

function newTemplateId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "tpl_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.textContent = message;

  let bg = "#2196F3";
  if (type === "success") bg = "#4CAF50";
  if (type === "error") bg = "#f44336";

  Object.assign(notification.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "15px 25px",
    background: bg,
    color: "white",
    borderRadius: "10px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    zIndex: "10000",
    fontWeight: "900"
  });

  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2500);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}
function toYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/* =========================================================
   ADMIN PIN MODAL
========================================================= */
function openAdminPinModal() {
  const overlay = document.getElementById("adminPinOverlay");
  const input = document.getElementById("adminPinInput");
  const error = document.getElementById("adminPinError");

  error.style.display = "none";
  input.value = "";

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  setTimeout(() => input.focus(), 50);
}

function closeAdminPinModal() {
  const overlay = document.getElementById("adminPinOverlay");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}
/* =========================================================
   CONFETTI (no library)
========================================================= */
let confettiCanvas = null;
let confettiCtx = null;
let confettiRAF = null;
let confettiParticles = [];
let confettiEndAt = 0;

function ensureConfettiCanvas() {
  if (confettiCanvas && confettiCtx) return;

  confettiCanvas = document.getElementById("confettiCanvas");
  if (!confettiCanvas) {
    confettiCanvas = document.createElement("canvas");
    confettiCanvas.id = "confettiCanvas";
    document.body.appendChild(confettiCanvas);
  }
  confettiCtx = confettiCanvas.getContext("2d");

  const resize = () => {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    confettiCanvas.width = Math.floor(window.innerWidth * dpr);
    confettiCanvas.height = Math.floor(window.innerHeight * dpr);
    confettiCanvas.style.width = `${window.innerWidth}px`;
    confettiCanvas.style.height = `${window.innerHeight}px`;
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize);
}

function spawnConfettiBurst(originEl, amount = 90) {
  ensureConfettiCanvas();

  const rect = originEl?.getBoundingClientRect?.();
  const ox = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const oy = rect ? rect.top + rect.height / 2 : window.innerHeight / 3;

  const shapes = ["rect", "circle"];
  const now = performance.now();

  for (let i = 0; i < amount; i++) {
    const angle = (-Math.PI / 2) + (Math.random() * Math.PI * 0.9 - Math.PI * 0.45); // mostly upward
    const speed = 6 + Math.random() * 7;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    confettiParticles.push({
      x: ox,
      y: oy,
      vx,
      vy,
      g: 0.18 + Math.random() * 0.12,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      // random bright-ish color
      color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 55%)`,
      born: now,
      life: 1600 + Math.random() * 900
    });
  }

  confettiEndAt = Math.max(confettiEndAt, now + 2200);

  if (!confettiRAF) confettiRAF = requestAnimationFrame(stepConfetti);
}

function stepConfetti(t) {
  if (!confettiCtx || !confettiCanvas) return;

  const ctx = confettiCtx;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const alive = [];
  for (const p of confettiParticles) {
    const age = t - p.born;
    if (age > p.life) continue;

    // physics
    p.vy += p.g;
    p.vx *= 0.995;
    p.vy *= 0.995;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    // fade out near end
    const fade = Math.max(0, Math.min(1, 1 - (age / p.life)));
    ctx.globalAlpha = fade;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;

    if (p.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    }

    ctx.restore();

    // keep if still on screen-ish
    if (p.y < window.innerHeight + 80 && p.x > -80 && p.x < window.innerWidth + 80) {
      alive.push(p);
    }
  }

  ctx.globalAlpha = 1;
  confettiParticles = alive;

  // stop when done
  if (t < confettiEndAt && confettiParticles.length) {
    confettiRAF = requestAnimationFrame(stepConfetti);
  } else {
    confettiRAF && cancelAnimationFrame(confettiRAF);
    confettiRAF = null;
    confettiParticles = [];
    if (confettiCtx) confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}
