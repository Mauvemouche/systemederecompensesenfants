import { DEFAULT_FAMILY } from "./family-defaults.js";

export function renderFamilyShell(people) {
  const list = Array.isArray(people) && people.length ? people : DEFAULT_FAMILY;
  const filters = document.querySelector(".filters");
  if (filters) {
    const current = document.querySelector(".filter-btn.active")?.dataset.filter || "all";
    filters.innerHTML = `<button class="filter-btn${current === "all" ? " active" : ""}" data-filter="all" type="button">Tous</button>`;
    list.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = `filter-btn${current === p.id ? " active" : ""}`;
      btn.dataset.filter = p.id;
      btn.type = "button";
      btn.textContent = p.name;
      filters.appendChild(btn);
    });
  }

  const assigned = document.getElementById("assignedTo");
  if (assigned) {
    const prev = assigned.value;
    assigned.innerHTML = `<option value="">— Choisir —</option>` +
      list.map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join("");
    if (prev && list.some((p) => p.id === prev)) assigned.value = prev;
  }

  const editAssigned = document.getElementById("editAssignedTo");
  if (editAssigned) {
    editAssigned.innerHTML = list
      .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`)
      .join("");
  }

  const personFilter = document.getElementById("personFilter");
  if (personFilter) {
    const prev = personFilter.value;
    personFilter.innerHTML = `<option value="all">Tous</option>` +
      list.map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join("");
    if (prev) personFilter.value = prev;
  }

  const container = document.querySelector(".persons-container");
  if (container) {
    container.innerHTML = list.map((p) => personSectionHtml(p)).join("");
  }

  const kids = list.filter((p) => p.role === "child").map((p) => p.name);
  const subtitle = document.getElementById("familySubtitle");
  if (subtitle) {
    subtitle.textContent = kids.length
      ? `Suivi des tâches et du temps d’écran (${kids.join(" & ")})`
      : "Suivi des tâches et du temps d’écran";
  }
}

function personNameRow(p) {
  const name = escapeHtml(p.name);
  const id = escapeAttr(p.id);
  const canRename = !!(window.__replicaState?.isOwner && window.__replicaState?.hasAccess);
  const edit = canRename
    ? `<button type="button" class="btn-rename-person" data-person-id="${id}" title="Modifier">Modifier</button>`
    : "";
  return `<div class="person-name-row"><div class="person-name">${name}</div>${edit}</div>`;
}

function personSectionHtml(p) {
  const theme = p.theme || p.id;
  const id = escapeAttr(p.id);
  const isChild = p.role === "child";

  const badges = isChild
    ? `<div class="person-badges">
  <span id="gift-time-${id}" class="screen-time-badge gift-time" title="Bonus: accordé uniquement si 100% des étoiles non-bonus sont atteintes">
  🎁 +<span id="gift-minutes-${id}">0</span> min
</span>
  <span id="base-time-${id}" class="screen-time-badge">⏱ Base: <span id="base-minutes-${id}">0</span> min</span>
  <span id="screen-time-badge-${id}" class="screen-time-badge">
    📱 Total: <span id="screen-minutes-${id}">0</span> min
    <span id="bonus-time-${id}" class="bonus-time">(+<span id="bonus-minutes-${id}">0</span>)</span>
  </span>
</div>`
    : "";

  const titleInner = isChild
    ? `<div class="person-left">
    ${personNameRow(p)}
    <div class="tasks-count"><span id="tasks-count-${id}">0</span> tâche(s)</div>
  </div>
  <div class="person-right">
    <div class="stars-earned" id="stars-count-${id}">0 / 20</div>
    <div class="progress-details"><span id="percentage-${id}">0%</span></div>
  </div>`
    : `<div>
              ${personNameRow(p)}
              <div class="tasks-count"><span id="tasks-count-${id}">0</span> tâche(s)</div>
            </div>
            <div class="stats">
              <div class="stars-earned" id="stars-count-${id}">0 <span style="opacity:.6;">/ 0</span></div>
              <div class="progress-details"><span id="percentage-${id}">0%</span></div>
            </div>`;

  return `<section class="person-section ${theme}" data-person="${id}">
        <div class="person-header">
          <div class="person-title">
            ${titleInner}
          </div>
          ${badges}
        </div>
        <div class="progress-container">
          <div class="progress-bar"><div class="progress-fill" id="progress-fill-${id}"></div></div>
        </div>
        <div class="admin-buttons">
          <button class="btn-check-all" type="button" onclick="checkAllTasks('${id}', true)">✅ Tout cocher</button>
          <button class="btn-uncheck-all" type="button" onclick="checkAllTasks('${id}', false)">⬜ Tout décocher</button>
          <button class="btn-reset" type="button" onclick="resetPersonTasks('${id}')">🔁 Reset</button>
        </div>
        <div class="tasks-list" id="tasks-${id}"></div>
      </section>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
