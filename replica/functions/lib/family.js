"use strict";

const THEME_KEYS = ["papa", "maman", "child-a", "child-b"];

const DEFAULT_PARENTS = [
  { id: "papa", name: "Papa", role: "parent", theme: "papa" },
  { id: "maman", name: "Maman", role: "parent", theme: "maman" },
];

const DEFAULT_TEST_CHILDREN = [
  { id: "kid-1", name: "Kid 1", role: "child", theme: "child-a" },
  { id: "kid-2", name: "Kid 2", role: "child", theme: "child-b" },
];

const DEFAULT_FAMILY = [...DEFAULT_PARENTS, ...DEFAULT_TEST_CHILDREN];

function slugifyName(name, used = new Set()) {
  const base =
    String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "enfant";

  let id = base;
  let n = 2;
  while (used.has(id) || id === "papa" || id === "maman") {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function peopleFromChildNames(childNames) {
  const used = new Set(["papa", "maman"]);
  const children = [];
  (childNames || []).forEach((raw, i) => {
    const name = String(raw || "").trim();
    if (!name) return;
    const id = slugifyName(name, used);
    used.add(id);
    children.push({
      id,
      name,
      role: "child",
      theme: THEME_KEYS[(i + 2) % THEME_KEYS.length],
    });
  });
  return [...DEFAULT_PARENTS, ...children];
}

function personIds(people) {
  return (people || []).map((p) => p.id);
}

function childIds(people) {
  return (people || []).filter((p) => p.role === "child").map((p) => p.id);
}

function normalizePersonName(raw) {
  const name = String(raw ?? "").trim();
  if (name.length < 1 || name.length > 40) return null;
  return name;
}

function renamePersonInList(people, personId, rawName) {
  const name = normalizePersonName(rawName);
  if (!name) return { error: "invalid-name" };
  const list = (people || []).map((p) => ({ ...p }));
  const idx = list.findIndex((p) => p.id === personId);
  if (idx < 0) return { error: "not-found" };
  const current = list[idx];
  list[idx] = {
    ...current,
    id: current.id,
    role: current.role,
    theme: current.theme,
    name,
  };
  return { people: list };
}

module.exports = {
  THEME_KEYS,
  DEFAULT_PARENTS,
  DEFAULT_TEST_CHILDREN,
  DEFAULT_FAMILY,
  slugifyName,
  peopleFromChildNames,
  personIds,
  childIds,
  normalizePersonName,
  renamePersonInList,
};
