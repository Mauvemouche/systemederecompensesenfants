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
import { familyTasksCol, familyTaskDoc } from "./family-path.js";

let PEOPLE = ["papa", "maman", "kid-1", "kid-2"];
const ADMIN_PIN = "1571";

let unlocked = false;
let unsubscribe = null;

function $(id) { return document.getElementById(id); }

function showToast(msg) {
  const n = document.createElement("div");
  n.textContent = msg;
  Object.assign(n.style, {
    position: "fixed",
    top: "18px",
    right: "18px",
    padding: "12px 14px",
    background: "#111",
    color: "#fff",
    borderRadius: "12px",
    fontWeight: "900",
    zIndex: 10000,
    boxShadow: "0 12px 24px rgba(0,0,0,.25)"
  });
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getSelectedDow() {
  const v = $("dayFilter").value;
  if (v === "today") return new Date().getDay();
  return Number(v);
}

function getPersonFilter() {
  return $("personFilter").value;
}

/* =========================
   PIN
========================= */
function openPin() {
  $("pinOverlay").classList.remove("hidden");
  $("pinErr").style.display = "none";
  $("pinInput").value = "";
  setTimeout(() => $("pinInput").focus(), 50);
}

function closePin(goBack = false) {
  if (goBack) window.location.href = "./index.html";
  $("pinOverlay").classList.add("hidden");
}

function lock() {
  unlocked = false;
  sessionStorage.removeItem("manageUnlocked");
  openPin();
  unsubscribe?.();
  unsubscribe = null;
  $("tasksList").innerHTML = "";
  $("tasksInfo").textContent = "";
}

function unlock() {
  unlocked = true;
  sessionStorage.setItem("manageUnlocked", "true");
  $("pinOverlay").classList.add("hidden");
  startListening();
}

/* =========================
   LISTEN / RENDER
========================= */
function startListening() {
  if (!window.db) {
    alert("Firebase non initialisé (window.db manquant).");
    return;
  }
  unsubscribe?.();

  const dow = getSelectedDow();
  const person = getPersonFilter();

  const base = query(familyTasksCol(), where("dayOfWeek", "==", dow));
  // Filtre personne côté client pour éviter index composé inutile
  unsubscribe = onSnapshot(base, (snap) => {
    let tasks = [];
    snap.forEach((d) => tasks.push({ id: d.id, ...d.data() }));

    if (person !== "all") tasks = tasks.filter(t => (t.assignedTo || "") === person);

    // Tri proche de ton app : assignedTo puis order puis createdAt
    tasks.sort((a, b) => {
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

    render(tasks);
  });
}

function render(tasks) {
  const dow = getSelectedDow();
  const person = getPersonFilter();
  $("tasksInfo").textContent = `Jour: ${dow} — Personne: ${person} — ${tasks.length} tâche(s)`;

  const list = $("tasksList");
  list.innerHTML = "";

  tasks.forEach((t) => {
    const el = document.createElement("div");
    el.className = "task";

    const chk = document.createElement("div");
    chk.className = `chk ${t.completed ? "on" : ""}`;
    chk.textContent = t.completed ? "✓" : "";
    chk.title = "Cocher / décocher";
    chk.addEventListener("click", async () => {
      await updateDoc(familyTaskDoc( t.id), {
        completed: !t.completed,
        updatedAt: serverTimestamp()
      });
    });

    const left = document.createElement("div");
    left.className = "task-left";
    left.appendChild(chk);

    const content = document.createElement("div");
    content.innerHTML = `
      <div class="task-title">${escapeHtml(t.title || "")}</div>
      ${t.description ? `<div class="task-desc">${escapeHtml(t.description)}</div>` : ""}
      <div class="meta">
        <span class="tag">👤 ${escapeHtml(t.assignedTo || "?")}</span>
        <span class="tag">⭐ ${Number(t.stars || 3)}</span>
        <span class="tag">🏷️ ${escapeHtml(t.category || "")}</span>
        ${t.isBonus ? `<span class="tag">🎁 bonus</span>` : ``}
        ${t.isPenalty ? `<span class="tag">⛔ pénalité</span>` : ``}
        ${t.isSeriousFault ? `<span class="tag">💀 faute grave</span>` : ``}
        ${t.fullDate ? `<span class="tag">📅 ${escapeHtml(String(t.fullDate))}</span>` : ``}
        ${t.dayOfMonth ? `<span class="tag">🗓️ ${escapeHtml(String(t.dayOfMonth))}</span>` : ``}
      </div>
    `;
    left.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn ghost";
    editBtn.type = "button";
    editBtn.textContent = "✏️ Modifier";
    editBtn.addEventListener("click", () => editTask(t.id));

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.type = "button";
    delBtn.textContent = "🗑️ Supprimer";
    delBtn.addEventListener("click", () => deleteTask(t.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    el.appendChild(left);
    el.appendChild(actions);
    list.appendChild(el);
  });
}

function escapeHtml(x) {
  const d = document.createElement("div");
  d.textContent = x ?? "";
  return d.innerHTML;
}

/* =========================
   ADD TASK (mêmes règles que ton app)
========================= */
async function submitTask(e) {
  e.preventDefault();

  const title = $("taskTitle").value.trim();
  const description = $("taskDescription").value.trim();
  const assignedTo = $("assignedTo").value;
  const stars = parseInt($("stars").value || "3", 10);
  const category = $("category").value;

  const isBonus = $("isBonus").checked || /bonus/i.test(title);
  const isPenalty = $("isPenalty").checked;
  const isSeriousFault = $("isSeriousFault").checked;

  if (!title || !assignedTo) return showToast("Titre + personne obligatoires");

  // Calcul ordre = nombre de tâches existantes pour ce jour/personne (comme ton app)
  const dowForOrder = getSelectedDow();
  const snap = await getDocs(
    query(familyTasksCol(), where("assignedTo", "==", assignedTo), where("dayOfWeek", "==", dowForOrder))
  );
  const nextOrder = snap.size;

  const base = {
    title,
    description,
    assignedTo,
    stars: Number.isFinite(stars) ? stars : 3,
    category,
    isBonus,
    isPenalty,
    isSeriousFault,
    completed: false,
    order: nextOrder,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // hebdomadaire => dimanche
  if (category === "hebdomadaire") {
    await addDoc(familyTasksCol(), {
      ...base,
      dayOfWeek: 0,
      fullDate: null,
      dayOfMonth: null
    });
    resetForm();
    showToast("Ajoutée (hebdo / dimanche)");
    return;
  }

  // ponctuel / mensuel => date
  if (category === "ponctuel" || category === "mensuel") {
    const dateVal = $("specificDate").value;
    if (!dateVal) return showToast("Sélectionne une date");
    const d = new Date(dateVal);

    await addDoc(familyTasksCol(), {
      ...base,
      dayOfWeek: d.getDay(),
      fullDate: category === "ponctuel" ? dateVal : null,
      dayOfMonth: category === "mensuel" ? d.getDate() : null
    });

    resetForm();
    showToast("Ajoutée");
    return;
  }

  // quotidien => jours cochés
  const selectedDays = [];
  for (let i = 0; i <= 6; i++) if ($(`day${i}`)?.checked) selectedDays.push(i);
  if (selectedDays.length === 0) return showToast("Choisis au moins un jour");

  await Promise.all(
    selectedDays.map((day) =>
      addDoc(familyTasksCol(), { ...base, dayOfWeek: day, fullDate: null, dayOfMonth: null })
    )
  );

  resetForm();
  showToast(`Ajoutée (${selectedDays.length} jour(s))`);
}

function resetForm() {
  $("taskForm").reset();
  $("specificDateGroup").style.display = "none";
  $("daysSelectionGroup").style.display = "block";
  $("allDays").checked = true;
  for (let i = 0; i <= 6; i++) if ($(`day${i}`)) $(`day${i}`).checked = true;
}

/* =========================
   EDIT / DELETE
========================= */
async function deleteTask(id) {
  if (!confirm("Supprimer cette tâche ?")) return;
  await deleteDoc(familyTaskDoc( id));
  showToast("Supprimée");
}

async function editTask(id) {
  const snap = await getDoc(familyTaskDoc( id));
  if (!snap.exists()) return showToast("Introuvable");
  openEditModal(id, snap.data());
}
/* =========================
   EDIT MODAL (V2)
========================= */
function openEditModal(id, t) {
  $("editId").value = id;

  $("editTaskTitle").value = t.title ?? "";
  $("editDescription").value = t.description ?? "";
  $("editAssignedTo").value = t.assignedTo ?? "papa";
  $("editStars").value = String(t.stars ?? 3);
  $("editCategory").value = t.category ?? "quotidien";

  $("editIsBonus").checked = !!t.isBonus;
  $("editIsPenalty").checked = !!t.isPenalty;
  $("editIsSeriousFault").checked = !!t.isSeriousFault;

  // date fields
  $("editSpecificDate").value = t.fullDate ?? "";
  syncEditCategoryUI(t);

  // reset dup checkboxes
  for (let i = 0; i <= 6; i++) {
    const cb = $(`dupDay${i}`);
    if (cb) cb.checked = false;
  }

  $("editOverlay").classList.remove("hidden");
  $("editOverlay").setAttribute("aria-hidden", "false");

  setTimeout(() => $("editTaskTitle").focus(), 40);
}

function closeEditModal() {
  $("editOverlay").classList.add("hidden");
  $("editOverlay").setAttribute("aria-hidden", "true");
}

function syncEditCategoryUI(taskData = null) {
  const cat = $("editCategory").value;
  const group = $("editSpecificDateGroup");
  const label = $("editDateLabel");

  const show = cat === "ponctuel" || cat === "mensuel";
  group.style.display = show ? "flex" : "none";
  label.textContent = cat === "mensuel" ? "Date du mois concerné" : "Date spécifique";

  // si tâche ponctuelle : garder la date existante
  if (taskData && taskData.category === "ponctuel" && taskData.fullDate) {
    $("editSpecificDate").value = taskData.fullDate;
  }
}

async function saveEditModal(e) {
  e.preventDefault();

  const id = $("editId").value;

  const title = $("editTaskTitle").value.trim();
  const description = $("editDescription").value.trim();
  const assignedTo = $("editAssignedTo").value;
  const stars = Math.max(1, Math.min(5, parseInt($("editStars").value, 10) || 3));
  const category = $("editCategory").value;

  const bonusFromTitle = /bonus/i.test(title);
  const isBonus = $("editIsBonus").checked || bonusFromTitle;
  const isPenalty = $("editIsPenalty").checked;
  const isSeriousFault = $("editIsSeriousFault").checked;

  if (!title || !assignedTo) return showToast("Titre + personne obligatoires");

  const payload = {
    title,
    description,
    assignedTo,
    stars,
    category,
    isBonus,
    isPenalty,
    isSeriousFault,
    updatedAt: serverTimestamp()
  };

  // gestion récurrence
  if (category === "hebdomadaire") {
    payload.dayOfWeek = 0;
    payload.fullDate = null;
    payload.dayOfMonth = null;
  } else if (category === "ponctuel" || category === "mensuel") {
    const dateVal = $("editSpecificDate").value;
    if (!dateVal) return showToast("Sélectionne une date");
    const d = new Date(dateVal);

    payload.dayOfWeek = d.getDay();
    if (category === "ponctuel") {
      payload.fullDate = dateVal;
      payload.dayOfMonth = null;
    } else {
      payload.fullDate = null;
      payload.dayOfMonth = d.getDate();
    }
  }
  // quotidien : on ne touche pas dayOfWeek/fullDate/dayOfMonth ici

  await updateDoc(familyTaskDoc( id), payload);
  showToast("Modifiée ✅");
  closeEditModal();
}

async function deleteFromModal() {
  const id = $("editId").value;
  if (!confirm("Supprimer cette tâche ?")) return;
  await deleteDoc(familyTaskDoc( id));
  showToast("Supprimée 🗑️");
  closeEditModal();
}

/* =========================
   DUPLICATE (creates copies as 'quotidien')
   - keeps title/desc/stars/flags/assignedTo
   - completed resets to false
   - category forced to 'quotidien'
   - dayOfWeek set to each chosen day
========================= */
async function duplicateFromModal() {
  const id = $("editId").value;
  const snap = await getDoc(familyTaskDoc( id));
  if (!snap.exists()) return showToast("Introuvable");
  const t = snap.data();

  const days = [];
  for (let i = 0; i <= 6; i++) {
    if ($(`dupDay${i}`)?.checked) days.push(i);
  }
  if (days.length === 0) return showToast("Choisis au moins un jour");

  const assignedTo = t.assignedTo ?? "papa";

  // Pour un order propre, on calcule l'ordre par (assignedTo + dayOfWeek)
  async function nextOrderFor(day) {
    const s = await getDocs(
      query(familyTasksCol(),
        where("assignedTo", "==", assignedTo),
        where("dayOfWeek", "==", day)
      )
    );
    return s.size;
  }

  const base = {
    title: t.title ?? "",
    description: t.description ?? "",
    assignedTo,
    stars: Number(t.stars ?? 3),
    isBonus: !!t.isBonus,
    isPenalty: !!t.isPenalty,
    isSeriousFault: !!t.isSeriousFault,
    completed: false,
    category: "quotidien",
    fullDate: null,
    dayOfMonth: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  for (const day of days) {
    const order = await nextOrderFor(day);
    await addDoc(familyTasksCol(), { ...base, dayOfWeek: day, order });
  }

  showToast(`Dupliquée (${days.length}) 📌`);
  // on laisse la modal ouverte (pratique), sinon tu peux closeEditModal();
}

/* =========================
   EVENTS
========================= */
function setupCategoryUI() {
  $("category").addEventListener("change", (e) => {
    const val = e.target.value;
    const specific = $("specificDateGroup");
    const daysGroup = $("daysSelectionGroup");
    const dateLabel = $("dateLabel");

    if (val === "ponctuel" || val === "mensuel") {
      specific.style.display = "block";
      daysGroup.style.display = "none";
      dateLabel.textContent = val === "mensuel" ? "Date du mois concerné" : "Date spécifique";
    } else if (val === "hebdomadaire") {
      specific.style.display = "none";
      daysGroup.style.display = "none";
    } else {
      specific.style.display = "none";
      daysGroup.style.display = "block";
    }
  });

  $("allDays").addEventListener("change", (e) => {
    const checked = e.target.checked;
    for (let i = 0; i <= 6; i++) if ($(`day${i}`)) $(`day${i}`).checked = checked;
  });

  for (let i = 0; i <= 6; i++) {
    $(`day${i}`)?.addEventListener("change", () => {
      const every = [...Array(7)].every((_, idx) => $(`day${idx}`)?.checked);
      $("allDays").checked = every;
    });
  }
}

function bootManagePage() {
  if (!window.db) {
    alert("Firebase non initialisé (window.db). Vérifie firebase-config.js.");
    return;
  }

  const people = window.__replicaState?.people;
  if (Array.isArray(people) && people.length) {
    PEOPLE = people.map((p) => p.id);
  }

    // PIN (V3 HTML: pinForm + pinUnlockBtn)
  $("pinForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = $("pinInput").value.trim() === ADMIN_PIN;
    if (!ok) {
      // si tu n'as plus pinErr, tu peux juste faire un toast/alert
      showToast?.("Code incorrect");
      return;
    }
    unlock();
  });

  $("pinUnlockBtn")?.addEventListener("click", (e) => {
    // au cas où (si jamais le bouton n'est pas submit)
    e.preventDefault();
    $("pinForm")?.requestSubmit?.();
  });

  $("pinCancelBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    closePin(true);
  });


  $("logoutBtn").addEventListener("click", lock);

  // Form
  $("taskForm").addEventListener("submit", submitTask);
  $("resetFormBtn").addEventListener("click", resetForm);
  setupCategoryUI();

  // Filters
  $("dayFilter").addEventListener("change", () => { if (unlocked) startListening(); });
  $("personFilter").addEventListener("change", () => { if (unlocked) startListening(); });

  // Auto-unlock via session (pratique)
  if (sessionStorage.getItem("manageUnlocked") === "true") unlock();
  else openPin();
  // ===== Edit modal events (V2)
$("editCloseBtn")?.addEventListener("click", closeEditModal);
$("editCancelBtn")?.addEventListener("click", closeEditModal);
$("editOverlay")?.addEventListener("click", (e) => {
  if (e.target === $("editOverlay")) closeEditModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEditModal();
});

$("editCategory")?.addEventListener("change", () => syncEditCategoryUI());

$("editForm")?.addEventListener("submit", saveEditModal);
$("editDeleteBtn")?.addEventListener("click", deleteFromModal);
$("editDuplicateBtn")?.addEventListener("click", duplicateFromModal);
}

window.addEventListener("replica-ready", bootManagePage);
if (window.db && window.auth?.currentUser) bootManagePage();
