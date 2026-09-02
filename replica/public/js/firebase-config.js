/**
 * Firebase web config for the multi-family replica (one public/ folder, two hostings).
 * Hostname picks the project. Never point this at Anthony's live family Firebase project.
 * Do not add measurementId — replica hosting must not initialize Analytics.
 *
 * Test keys match the current recompenses-test web app. Prod keys are the
 * kidsrewardsystem web client config (not secrets).
 */
const TEST_CONFIG = {
  apiKey: "AIzaSyB8nedRkn_wTGkIiMKXFioCNm3mQySVCOE",
  authDomain: "recompenses-test.firebaseapp.com",
  projectId: "recompenses-test",
  storageBucket: "recompenses-test.firebasestorage.app",
  messagingSenderId: "255786009006",
  appId: "1:255786009006:web:2379f0d27ad4bc5470483f",
};

const PROD_CONFIG = {
  apiKey: "AIzaSyC28xeJVbWCTZsA8dx8LScBM9qn8M9-nk4",
  authDomain: "kidsrewardsystem.firebaseapp.com",
  projectId: "kidsrewardsystem",
  storageBucket: "kidsrewardsystem.firebasestorage.app",
  messagingSenderId: "817182317925",
  appId: "1:817182317925:web:65de3d62e5d18d0060d58c",
};

const PROD_HOSTS = new Set([
  "kidsrewardsystem.com",
  "www.kidsrewardsystem.com",
  "kidsrewardsystem.web.app",
  "kidsrewardsystem.firebaseapp.com",
]);

export function firebaseConfigForHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return PROD_HOSTS.has(host) ? PROD_CONFIG : TEST_CONFIG;
}

const currentHost = typeof location !== "undefined" ? location.hostname : "";
export const firebaseConfig = firebaseConfigForHostname(currentHost);

export const FUNCTIONS_REGION = "europe-west1";

/** Per-instance reset notification email (same role as EMAIL_TO). Set when provisioning. Never a personal default. */
export const RESET_NOTIFICATION_EMAIL = "";
