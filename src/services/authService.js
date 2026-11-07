/**
 * authService.js — the ONLY file that knows how authentication works.
 *
 * Right now it uses a localStorage mock so you can build and test the whole
 * sign-in flow today. When you add Firebase, replace the function bodies
 * (see the commented block at the bottom). Keep the exports and the user
 * shape { uid, name, email } the same and nothing else in the app changes.
 *
 * DEV ONLY: the mock stores passwords in plain text in localStorage.
 */

const USERS_KEY = "talkmate_users";
const SESSION_KEY = "talkmate_session";
const listeners = new Set();

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const publicUser = ({ uid, name, email }) => ({ uid, name, email });
const fail = (code) => Object.assign(new Error(code), { code }); // same codes Firebase uses
const delay = (ms = 500) => new Promise((r) => setTimeout(r, ms));

function setSession(user) {
  if (user) write(SESSION_KEY, user); else localStorage.removeItem(SESSION_KEY);
  listeners.forEach((fn) => fn(user));
}

/** Calls cb(user | null) now and on every change. Returns an unsubscribe function. */
export function onAuthChange(cb) {
  listeners.add(cb);
  cb(read(SESSION_KEY, null)); // restores the session, so returning users stay signed in
  return () => listeners.delete(cb);
}

export async function signUp({ name, email, password }) {
  await delay();
  const users = read(USERS_KEY, []);
  const mail = email.trim().toLowerCase();
  if (users.some((u) => u.email === mail)) throw fail("auth/email-already-in-use");
  if (password.length < 6) throw fail("auth/weak-password");
  const user = { uid: crypto.randomUUID(), name: name.trim(), email: mail, password };
  write(USERS_KEY, [...users, user]);
  setSession(publicUser(user));
  return publicUser(user);
}

export async function signIn({ email, password }) {
  await delay();
  const mail = email.trim().toLowerCase();
  const found = read(USERS_KEY, []).find((u) => u.email === mail && u.password === password);
  if (!found) throw fail("auth/invalid-credential");
  setSession(publicUser(found));
  return publicUser(found);
}

export async function signInWithGoogle() {
  await delay();
  const user = { uid: "google-demo", name: "Demo Student", email: "demo@hastalavista.app" };
  setSession(user);
  return user;
}

export async function signOut() {
  await delay(150);
  setSession(null);
}

/* ======================= FIREBASE VERSION (later) =======================
npm i firebase

import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  updateProfile, signOut as fbSignOut,
} from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const app = initializeApp({ apiKey: "...", authDomain: "...", projectId: "..." });
const auth = getAuth(app);
export const db = getFirestore(app);

const toUser = (u) => u && { uid: u.uid, name: u.displayName || "", email: u.email };

export const onAuthChange = (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u)));

export async function signUp({ name, email, password }) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await setDoc(doc(db, "users", user.uid), { name, email, createdAt: serverTimestamp() });
  return toUser(user);
}
export async function signIn({ email, password }) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return toUser(user);
}
export async function signInWithGoogle() {
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
  await setDoc(doc(db, "users", user.uid),
    { name: user.displayName, email: user.email, lastLogin: serverTimestamp() }, { merge: true });
  return toUser(user);
}
export const signOut = () => fbSignOut(auth);
========================================================================= */