/**
 * authService.js — the ONLY file that knows how authentication works.
 *
 * Uses Firebase Authentication (email/password + Google). The rest of the app
 * only sees the small user shape { uid, name, email }, so pages and routing
 * stay unchanged.
 *
 * Passwords are handled entirely by Firebase Authentication. They are never
 * stored in localStorage or Firestore.
 */

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, firebaseConfigError } from "./firebase";

const NOT_CONFIGURED = "auth/firebase-not-configured";

const fail = (code, message) => Object.assign(new Error(message || code), { code });

function requireFirebase() {
  if (!auth || !db) throw fail(NOT_CONFIGURED, firebaseConfigError || "Firebase is not configured.");
}

const toUser = (u, nameOverride) =>
  u && { uid: u.uid, name: nameOverride ?? u.displayName ?? "", email: u.email || "" };

/**
 * Writes users/{uid}. Best effort: a successful sign-in must not be reported as
 * a failure just because the profile write was rejected. This can happen before
 * the Firestore rules are published; the write is retried on the next sign-in.
 */
async function writeProfile(user, { created }) {
  try {
    const ref = doc(db, "users", user.uid);
    let isNew = created;
    if (!isNew) {
      // One read on Google sign-in so createdAt is set only on the first one.
      const snap = await getDoc(ref);
      isNew = !snap.exists();
    }
    await setDoc(
      ref,
      {
        uid: user.uid,
        displayName: user.displayName || "",
        email: user.email || "",
        updatedAt: serverTimestamp(),
        ...(isNew ? { createdAt: serverTimestamp() } : {}),
      },
      { merge: true },
    );
  } catch (err) {
    console.error(
      "[auth] Signed in, but the user profile could not be written to Firestore. " +
        "Publish the Firestore security rules (firestore.rules), then sign in again.",
      err,
    );
  }
}

/** Calls cb(user | null) now and on every auth change. Returns an unsubscribe function. */
export function onAuthChange(cb) {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (u) => cb(toUser(u)));
}

export async function signUp({ name, email, password }) {
  requireFirebase();
  const cleanName = (name || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const { user } = await createUserWithEmailAndPassword(auth, cleanEmail, password);

  if (cleanName) {
    try {
      await updateProfile(user, { displayName: cleanName });
    } catch (err) {
      // The account exists; keep the name in the profile document anyway.
      console.error("[auth] Could not set the Firebase display name.", err);
    }
  }

  await writeProfile(user, { created: true });
  return toUser(user, cleanName);
}

export async function signIn({ email, password }) {
  requireFirebase();
  const cleanEmail = (email || "").trim().toLowerCase();
  const { user } = await signInWithEmailAndPassword(auth, cleanEmail, password);
  // Self-heals a profile document that could not be written at signup (for
  // example before the security rules were published). Not awaited: signing in
  // must not wait on an extra Firestore round-trip.
  void writeProfile(user, { created: false });
  return toUser(user);
}

export async function signInWithGoogle() {
  requireFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const { user } = await signInWithPopup(auth, provider);
  await writeProfile(user, { created: false });
  return toUser(user);
}

export async function signOut() {
  if (!auth) return;
  await fbSignOut(auth);
}
