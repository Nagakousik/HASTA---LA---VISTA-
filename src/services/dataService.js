/**
 * dataService.js — the ONLY file that knows where user data is stored.
 *
 * Firestore layout:
 *   users/{uid}                         -> { uid, displayName, email, resume,
 *                                            resumeUpdatedAt, recruiterHistory,
 *                                            createdAt, updatedAt }
 *   users/{uid}/interviews/{interviewId} -> { company, role, minutes, resume,
 *                                            candidateName, recruiterCameraOn,
 *                                            personaId, status, transcript,
 *                                            startedAt, endedAt, endReason,
 *                                            createdAt, updatedAt }
 *
 * The exported function signatures and return shapes match the previous
 * localStorage mock, so pages did not need to change.
 */

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db, firebaseConfigError } from "./firebase";

function requireDb() {
  if (!db) {
    throw Object.assign(new Error(firebaseConfigError || "Firebase is not configured."), {
      code: "firebase/not-configured",
    });
  }
}

const profileDoc = (uid) => doc(db, "users", uid);
const interviews = (uid) => collection(db, "users", uid, "interviews");
const interviewDoc = (uid, id) => doc(db, "users", uid, "interviews", id);

/** Firestore Timestamps -> milliseconds, so pages see the same shape as before. */
const millis = (value) =>
  value && typeof value.toMillis === "function" ? value.toMillis() : value;

function toSession(snap) {
  const data = snap.data() || {};
  return {
    ...data,
    id: snap.id,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
    startedAt: millis(data.startedAt),
    endedAt: millis(data.endedAt),
    resumeUpdatedAt: millis(data.resumeUpdatedAt),
  };
}

/** The user's saved (main) resume. One read per Prep page load. */
export async function getProfile(uid) {
  requireDb();
  const snap = await getDoc(profileDoc(uid));
  if (!snap.exists()) return { resume: "" };
  const data = snap.data() || {};
  return { ...data, resume: data.resume || "" };
}

export async function saveResume(uid, resume) {
  requireDb();
  await setDoc(
    profileDoc(uid),
    { resume, resumeUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Merge fields into the profile (for example the recruiter history). */
export async function patchProfile(uid, patch) {
  requireDb();
  await setDoc(
    profileDoc(uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Creates an interview session. The resume here is the copy tailored for THIS interview. */
export async function createSession(uid, { company, role, minutes, resume, candidateName }) {
  requireDb();
  const data = {
    company,
    role,
    minutes,
    resume,
    candidateName: (candidateName || "").trim(),
    recruiterCameraOn: Math.random() < 0.5,
    status: "setup",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(interviews(uid), data);
  // The caller only needs the id, but return a local copy with plain numbers.
  return { ...data, id: ref.id, createdAt: Date.now(), updatedAt: Date.now() };
}

/** Merge fields into an interview (status, personaId, transcript, endReason...). */
export async function updateSession(uid, id, patch) {
  requireDb();
  await updateDoc(interviewDoc(uid, id), { ...patch, updatedAt: serverTimestamp() });
  return { id, ...patch };
}

export async function getSession(uid, id) {
  requireDb();
  const snap = await getDoc(interviewDoc(uid, id));
  return snap.exists() ? toSession(snap) : null;
}
