/**
 * Firebase config for the multi-family replica platform (one URL, many families).
 * Replace every YOUR_* value for this Firebase project (recompenses-test).
 * Never point this at Anthony's live family Firebase project.
 */
export const firebaseConfig = {
  apiKey: "YOUR_REPLICA_API_KEY",
  authDomain: "YOUR_REPLICA_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_REPLICA_PROJECT_ID",
  storageBucket: "YOUR_REPLICA_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_REPLICA_SENDER_ID",
  appId: "YOUR_REPLICA_APP_ID",
};

export const FUNCTIONS_REGION = "europe-west1";

/** Per-instance reset notification email (same role as EMAIL_TO). Set when provisioning. Never a personal default. */
export const RESET_NOTIFICATION_EMAIL = "";
