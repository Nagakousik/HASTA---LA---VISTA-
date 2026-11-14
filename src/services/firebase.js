/**
 * firebase.js — the ONLY place where Firebase is configured and initialized.
 *
 * Configuration comes from Vite environment variables (see .env.example).
 * The Firebase web API key is not a secret: the security rules, not the key,
 * decide who can read or write data. Never put server keys in VITE_* variables.
 *
 * If configuration is missing the app still boots. Auth calls then reject with
 * "auth/firebase-not-configured" and the sign-in dialog shows a clear message
 * instead of the whole page failing with a blank screen.
 */

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const ENV_NAMES = {
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
};

// Static access is required so Vite can inline the values at build time.
const config = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
};

const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => ENV_NAMES[key]);

/** Empty when Firebase is ready; otherwise a message suitable for the console. */
export const firebaseConfigError = missing.length
  ? `Firebase is not configured. Add ${missing.join(", ")} to .env.local (copy .env.example) and restart the dev server.`
  : "";

let auth = null;
let db = null;

if (!firebaseConfigError) {
  // getApps() keeps hot reloads and StrictMode from initializing twice.
  const app = getApps().length ? getApp() : initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  console.error(`[firebase] ${firebaseConfigError}`);
}

export { auth, db };
export const isFirebaseConfigured = !firebaseConfigError;
