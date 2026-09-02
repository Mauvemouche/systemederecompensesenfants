import { collection, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function currentFamilyId() {
  const id = window.__replicaState?.familyId;
  if (!id) throw new Error("Famille non initialisée. Reconnecte-toi.");
  return id;
}

export function familyTasksCol() {
  return collection(window.db, "families", currentFamilyId(), "tasks");
}

export function familyTaskDoc(taskId) {
  return doc(window.db, "families", currentFamilyId(), "tasks", String(taskId));
}

export function familyCollection(name) {
  return collection(window.db, "families", currentFamilyId(), name);
}

export function familyDoc(col, id) {
  return doc(window.db, "families", currentFamilyId(), col, String(id));
}

export async function syncFamilyClaim(state) {
  if (state) window.__replicaState = state;
  const user = window.auth?.currentUser;
  const familyId = window.__replicaState?.familyId;
  if (!user || !familyId) return state;
  const token = await user.getIdTokenResult();
  if (token.claims.familyId !== familyId) {
    await user.getIdToken(true);
  }
  return state;
}
