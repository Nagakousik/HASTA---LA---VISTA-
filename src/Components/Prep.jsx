import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getProfile, saveResume, createSession } from "../services/dataService";
import Brand from "./Brand";
import "./Landing.css"; // shared look: glass, buttons, blobs
import "./Prep.css";

const COMPANIES = ["Google", "Amazon", "Microsoft", "TCS", "Infosys", "Wipro", "Accenture", "Zoho"];
const ROLES = ["SDE Intern", "Frontend Developer", "Backend Developer", "Full Stack Developer", "Data Analyst"];
const DURATIONS = [
  { min: 5, title: "5 minutes", sub: "Quick screening" },
  { min: 10, title: "10 minutes", sub: "Technical round" },
];
const MIN_RESUME = 80;     // characters needed to start
const USED_CHARS = 3500;   // the AI reads this many characters
const MAX_CHARS = 8000;

function Chips({ label, items, value, onPick }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {items.map((it) => (
        <button type="button" key={it} className={`chip-btn ${value === it ? "on" : ""}`} onClick={() => onPick(it)}>
          {it}
        </button>
      ))}
    </div>
  );
}

export default function Prep() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [resume, setResume] = useState("");
  const [saved, setSaved] = useState("");
  const [alsoSave, setAlsoSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [toast, setToast] = useState("");
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const [loadedName, setLoadedName] = useState("");
  const errRef = useRef(null);
  const toastTimer = useRef(null);
  const resumeTouched = useRef(false);
  const startingRef = useRef(false);
  const savingRef = useRef(false);

  const first = (user.name || user.email || "there").split(/[\s@]/)[0];
  const dirty = resume.trim() !== saved.trim();

  // Load the saved resume (Firestore later)
  useEffect(() => {
    let off = false;
    getProfile(user.uid)
      .then((p) => {
        if (off) return;
        const savedText = p.resume || "";
        setSaved(savedText);
        // Never overwrite a resume the candidate pasted or uploaded while loading.
        if (!resumeTouched.current) setResume(savedText);
      })
      .catch(() => {})
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [user.uid]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (errors.length) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [errors]);

  const flash = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const readFile = async (file) => {
    if (!file || reading) return;
    setReading(true);
    setErrors([]);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let text;
      if (ext === "txt" || ext === "md") {
        // Plain text needs no extra library, so it always works
        if (file.size > 1_000_000) throw new Error("That file is too large. Use a text file under 1 MB.");
        text = await file.text();
      } else {
        // PDF and Word readers load only when needed. If the packages are missing, the page keeps working.
        let read;
        try {
          ({ readResumeFile: read } = await import("../utils/resumeReader"));
        } catch (err) {
          console.error("Resume reader could not load. In your project folder run: npm install pdfjs-dist@4.10.38 mammoth@1.13.0", err);
          throw new Error("Reading PDF and Word files isn't available right now. Paste your resume text into the box instead.");
        }
        text = await read(file);
      }
      resumeTouched.current = true;
      setResume(text.slice(0, MAX_CHARS));
      setLoadedName(file.name);
      flash("Resume loaded from file");
    } catch (err) {
      setErrors([err.message || "Couldn't read that file. Paste the text instead."]);
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    if (!resume.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveResume(user.uid, resume.trim());
      setSaved(resume.trim());
      flash("Saved as your main resume");
    } catch {
      setErrors(["Couldn't save your resume. Check your connection and try again."]);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleStart = async () => {
    if (startingRef.current) return;
    const errs = [];
    if (company.trim().length < 2) errs.push("Enter the company you're practising for.");
    if (role.trim().length < 2) errs.push("Enter the role you're applying for.");
    if (resume.trim().length < MIN_RESUME) errs.push("Add your resume or project details (a few lines at least) so the recruiter has something to ask about.");
    setErrors(errs);
    if (errs.length) return;

    startingRef.current = true;
    setBusy(true);
    try {
      // First time: your resume becomes the saved one. Later: only if you tick the box.
      if (!saved || (alsoSave && dirty)) await saveResume(user.uid, resume.trim());
      const s = await createSession(user.uid, {
        company: company.trim(),
        role: role.trim(),
        minutes,
        resume: resume.trim(),
        candidateName: (user.name || "").trim(),
      });
      navigate(`/app/check/${s.id}`);
    } catch {
      startingRef.current = false;
      setErrors(["Couldn't start the session. Please try again."]);
      setBusy(false);
    }
  };

  const handleLogout = async () => { await signOut(); navigate("/"); };

  const summary = [company.trim(), role.trim()].filter(Boolean).length
    ? [company.trim(), role.trim(), `${minutes} min`].filter(Boolean).join(" · ")
    : "Add a company and role to begin";

  const StartButton = ({ className = "" }) => (
    <button className={`btn btn-primary ${className}`} onClick={handleStart} disabled={busy}>
      {busy ? <span className="spin" aria-label="Starting" /> : "Start Interview"}
    </button>
  );

  return (
    <div className="page prep">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />

      <header className="prep-bar">
        <div className="prep-bar-inner">
          <Link to="/" aria-label="Hasta La Vista home"><Brand /></Link>
          <div className="prep-user">
            <span className="avatar" aria-hidden="true">{first[0]?.toUpperCase()}</span>
            <span className="prep-name">{first}</span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </header>

      <main className="prep-main">
        <div className="prep-head">
          <h1>Let&rsquo;s get you interview-ready, {first}.</h1>
          <p>Add your resume, pick a company and role, then step into the hot seat.</p>
        </div>

        <div className="prep-grid">
          {/* ---------- Resume ---------- */}
          <section className="prep-card glass" style={{ "--d": "0.1s" }}>
            <div className="card-head">
              <div>
                <h2>Your resume</h2>
                <p>{saved ? "Your saved resume is loaded. Edit it to tailor it for this company." : "Paste your resume or project details. We'll remember it for next time."}</p>
              </div>
              <span className={`status ${dirty ? "edited" : saved ? "saved" : ""}`}>
                {dirty ? "Edited for this interview" : saved ? "Saved" : "Not saved yet"}
              </span>
            </div>

            <label
              className={`rdrop ${drag ? "drag" : ""} ${reading ? "busy" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept=".pdf,.docx,.txt,.md,.doc" className="sr-only" disabled={reading} onChange={(e) => { readFile(e.target.files[0]); e.target.value = ""; }} />
              <span>{reading ? "Reading your resume..." : <>Drop your resume here (<b>PDF</b>, <b>Word</b> or <b>.txt</b>) or tap to browse</>}</span>
            </label>
            {loadedName && <p className="loaded-note">Loaded from {loadedName}. Check the text below and fix anything that looks off, since PDF layouts can mix up columns.</p>}

            <textarea
              className="pf-text"
              aria-label="Resume text"
              value={resume}
              maxLength={MAX_CHARS}
              disabled={loading}
              onChange={(e) => { resumeTouched.current = true; setResume(e.target.value); setLoadedName(""); }}
              placeholder={loading ? "Loading your resume..." : "Example: Built a real-time chat app with Node.js, Socket.io and MongoDB for 500 users. Led a team of 4 on a college hackathon project. Skills: React, Express, SQL, Git..."}
            />

            <div className="resume-foot">
              <span className={`count ${resume.length > USED_CHARS ? "over" : ""}`}>
                {resume.length.toLocaleString()} characters
                {resume.length > USED_CHARS && ` · the first ${USED_CHARS.toLocaleString()} are used`}
              </span>
              <div className="resume-actions">
                {dirty && saved && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResume(saved)}>Reset to saved</button>}
                <button type="button" className="btn btn-soft btn-sm" onClick={handleSave} disabled={!resume.trim() || !dirty || saving}>
                  {saving ? "Saving..." : "Save as my resume"}
                </button>
              </div>
            </div>
            <p className="privacy">Your resume text is sent to the AI to personalise questions, so leave out your phone number and home address.</p>
          </section>

          {/* ---------- Interview details ---------- */}
          <aside className="prep-side">
            <div className="prep-card glass" style={{ "--d": "0.2s" }}>
              <h2>Interview details</h2>

              <label className="pf-label" htmlFor="company">Target company</label>
              <input id="company" className="pf-input" value={company} maxLength={60} autoComplete="off"
                onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Google, Amazon, TCS" />
              <Chips label="Popular companies" items={COMPANIES} value={company} onPick={setCompany} />

              <label className="pf-label" htmlFor="role">Target role</label>
              <input id="role" className="pf-input" value={role} maxLength={60} autoComplete="off"
                onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer, SDE Intern" />
              <Chips label="Popular roles" items={ROLES} value={role} onPick={setRole} />

              <span className="pf-label" id="dur-label">Duration</span>
              <div className="dur" role="radiogroup" aria-labelledby="dur-label">
                {DURATIONS.map((d) => (
                  <button type="button" key={d.min} role="radio" aria-checked={minutes === d.min}
                    className={`dur-opt ${minutes === d.min ? "on" : ""}`} onClick={() => setMinutes(d.min)}>
                    <b>{d.title}</b><small>{d.sub}</small>
                  </button>
                ))}
              </div>

              {dirty && saved && (
                <label className="check">
                  <input type="checkbox" checked={alsoSave} onChange={(e) => setAlsoSave(e.target.checked)} />
                  <span>Also update my saved resume with these changes</span>
                </label>
              )}

              {errors.length > 0 && (
                <ul className="pf-errors" ref={errRef} role="alert">
                  {errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}

              <div className="start-inline">
                <StartButton className="btn-lg" />
                <p className="hint-small">Next: a quick camera and mic check. Works best in Chrome or Edge.</p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Phones and tablets: Start button stays within thumb reach */}
      <div className="start-dock glass">
        <span className="dock-sum">{summary}</span>
        <StartButton />
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}