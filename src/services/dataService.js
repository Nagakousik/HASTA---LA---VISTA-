/**
 * dataService.js: the ONLY file that knows where user data is stored.
 *
 * Now: a localStorage mock so the whole flow works today.
 * Later: swap the function bodies for the Firestore version at the bottom.
 * Keep the exports and return shapes the same and no page needs to change.
 *
 * Data layout (same in the mock and in Firestore):
 *   users/{uid}                -> { resume, resumeUpdatedAt }
 *   users/{uid}/sessions/{id}  -> { company, role, minutes, resume, status, createdAt, ... }
 */

const profileKey = (uid) => `hlv_profile_${uid}`;
const sessionsKey = (uid) => `hlv_sessions_${uid}`;
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

/** The user's saved (main) resume. */
export async function getProfile(uid) {
  await delay();
  return read(profileKey(uid), { resume: "" });
}

export async function saveResume(uid, resume) {
  await delay();
  write(profileKey(uid), { ...read(profileKey(uid), {}), resume, resumeUpdatedAt: Date.now() });
}

/** Creates an interview session. The resume here is the copy tailored for THIS interview. */
export async function createSession(uid, { company, role, minutes, resume }) {
  await delay();
  const session = { id: crypto.randomUUID(), company, role, minutes, resume, status: "setup", createdAt: Date.now() };
  write(sessionsKey(uid), { ...read(sessionsKey(uid), {}), [session.id]: session });
  return session;
}

export async function getSession(uid, id) {
  await delay(100);
  return read(sessionsKey(uid), {})[id] || null;
}

/* ======================= FIRESTORE VERSION (later) =======================
Create services/firebase.js that exports `db` (initializeApp + getFirestore),
then replace the functions above with:

import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : { resume: "" };
}
export async function saveResume(uid, resume) {
  await setDoc(doc(db, "users", uid), { resume, resumeUpdatedAt: serverTimestamp() }, { merge: true });
}
export async function createSession(uid, data) {
  const ref = await addDoc(collection(db, "users", uid, "sessions"),
    { ...data, status: "setup", createdAt: serverTimestamp() });
  return { id: ref.id, ...data };
}
export async function getSession(uid, id) {
  const snap = await getDoc(doc(db, "users", uid, "sessions", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

Firestore security rules (so users only see their own data):
  match /users/{uid}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
========================================================================= */