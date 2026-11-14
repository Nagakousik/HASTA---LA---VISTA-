import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./AuthModal.css";

// Firebase Authentication error codes -> friendly text.
const MESSAGES = {
  "auth/email-already-in-use": "This email already has an account. Try signing in instead.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/user-not-found": "Email or password is incorrect.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/weak-password": "Use at least 6 characters for your password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
  "auth/network-request-failed": "No connection. Check your internet and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed. Try again.",
  "auth/popup-blocked": "Your browser blocked the Google pop-up. Allow pop-ups and try again.",
  "auth/cancelled-popup-request": "Google sign-in was interrupted. Try again.",
  "auth/account-exists-with-different-credential": "This email already uses a different sign-in method.",
  "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase.",
  "auth/unauthorized-domain": "Google sign-in is not allowed from this domain. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
  "auth/invalid-api-key": "Firebase rejected the configured API key. Check the VITE_FIREBASE_* values in .env.local.",
  "auth/firebase-not-configured": "Sign-in is unavailable because Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local and restart the app.",
};

const Icon = ({ d }) => (
  <svg className="field-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A16 16 0 0 0 2 12s4 7 10 7c1.6 0 3-.4 4.3-1",
};

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.4-4.8 7.1l7.6 5.9c4.4-4.1 7-10.1 7-17.5z"/>
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
  </svg>
);

export default function AuthModal({ open, mode: startMode, onClose, onSuccess }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState(startMode);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(startMode);
    setForm({ name: "", email: "", password: "" });
    setError("");
    setShowPw(false);
  }, [open, startMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;

  const isSignup = mode === "signup";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const switchTo = (m) => { setMode(m); setError(""); };

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onSuccess();
    } catch (err) {
      setError(MESSAGES[err.code] || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(() => (isSignup ? signUp(form) : signIn(form)));
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth glass" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>

        {/* ---------- Left: brand panel ---------- */}
        <aside className="auth-side" aria-hidden="true">
          <span className="orb o1" /><span className="orb o2" /><span className="orb o3" />
          <span className="logo">
            <span className="logo-mark"><span className="logo-lens" /></span>
            <span className="logo-words">
              <span className="logo-text">Hasta La Vista</span>
              <small className="logo-tag">Bye-bye interview nerves</small>
            </span>
          </span>

          <div className="side-copy">
            <h3>{isSignup ? "Your calm space to practise the real thing." : "Good to see you again."}</h3>
            <p>{isSignup ? "Friendly room. Serious recruiter. Full transcript." : "Pick up where you left off and keep improving."}</p>
          </div>

          <div className="side-chat">
            <p className="sb ai"><small>Recruiter</small>Walk me through your best project.</p>
            <p className="sb me"><small>You</small>Sure! I built a real-time chat app…</p>
            <span className="score-chip">Transcript <b>saved</b></span>
          </div>
        </aside>

        {/* ---------- Right: form ---------- */}
        <div className="auth-main">
          <div className="seg" role="tablist">
            <span className="seg-thumb" style={{ transform: `translateX(${isSignup ? 100 : 0}%)` }} />
            <button role="tab" aria-selected={!isSignup} onClick={() => switchTo("signin")}>Sign in</button>
            <button role="tab" aria-selected={isSignup} onClick={() => switchTo("signup")}>Sign up</button>
          </div>

          <h2 id="auth-title">{isSignup ? "Create your account ✨" : "Welcome back 👋"}</h2>
          <p className="modal-sub">
            {isSignup ? "Takes under a minute. Your first session is waiting." : "Sign in to continue your practice."}
          </p>

          <button type="button" className="btn google" disabled={busy} onClick={() => run(signInWithGoogle)}>
            <GoogleG /> Continue with Google
          </button>
          <div className="or"><span>or use email</span></div>

          <form onSubmit={submit} className="auth-form">
            {isSignup && (
              <label className="field">
                <Icon d={ICONS.user} />
                <input required autoComplete="name" value={form.name} onChange={set("name")} placeholder="Full name" aria-label="Full name" />
              </label>
            )}
            <label className="field">
              <Icon d={ICONS.mail} />
              <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="College email" aria-label="Email" />
            </label>
            <label className="field">
              <Icon d={ICONS.lock} />
              <input required minLength={6} type={showPw ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"}
                value={form.password} onChange={set("password")} placeholder="Password (min 6 characters)" aria-label="Password" />
              <button type="button" className="eye" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}>
                <Icon d={showPw ? ICONS.eyeOff : ICONS.eye} />
              </button>
            </label>

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="btn btn-primary btn-lg submit" disabled={busy}>
              {busy ? <span className="spin" /> : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="switch">
            {isSignup ? "Already have an account?" : "New to Hasta La Vista?"}{" "}
            <button type="button" onClick={() => switchTo(isSignup ? "signin" : "signup")}>
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}