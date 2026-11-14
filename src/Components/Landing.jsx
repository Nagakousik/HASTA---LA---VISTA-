import { useEffect, useRef, useState } from "react";
import "./Landing.css";

const CHAT = [
  { from: "ai", text: "Hi Ananya! I've read your resume. Tell me about your Node.js chat app project." },
  { from: "user", text: "I built a real-time chat app using Socket.io and MongoDB for 500 users." },
  { from: "ai", text: "Nice. How did you handle message ordering when two users sent at the same time?" },
  { from: "user", text: "I used server timestamps and a queue, so every message gets a stable order." },
  { from: "ai", text: "Good. Now what happens to that queue if the server restarts?" },
];

/* Reveal-on-scroll hook */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true">
        <span className="logo-lens" />
      </span>
      <span className="logo-words">
        <span className="logo-text">Hasta La Vista</span>
        <small className="logo-tag">Bye-bye interview nerves</small>
      </span>
    </span>
  );
}

function Navbar({ user, onSignIn, onGetStarted, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const navRef = useRef(null);

  useEffect(() => {
    const ids = ["explore", "how-it-works", "contact"];
    const fn = () => {
      setScrolled(window.scrollY > 12);
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = "";
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      });
      setActive(atBottom ? "contact" : current);
    };
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Close the mobile menu with Escape or a tap outside it
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onTap = (e) => navRef.current && !navRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onTap);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onTap);
    };
  }, [open]);

  return (
    <header ref={navRef} className={`nav ${scrolled ? "nav-scrolled" : ""}`}>
      <div className="nav-inner">
        <a href="#top" aria-label="Hasta La Vista home"><Logo /></a>
        <nav id="primary-nav" className={`nav-links ${open ? "open" : ""}`}>
          {[["#explore", "Explore"], ["#how-it-works", "How it works"], ["#contact", "Contact"]].map(([h, l]) => (
            <a key={h} href={h} className={active === h.slice(1) ? "active" : ""} aria-current={active === h.slice(1) ? "true" : undefined} onClick={() => setOpen(false)}>{l}</a>
          ))}
          <div className="nav-menu-actions">
            {user ? (
              <>
                <button className="btn btn-ghost" onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
                <button className="btn btn-primary" onClick={() => { setOpen(false); onGetStarted(); }}>Open app</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={() => { setOpen(false); onSignIn(); }}>Sign In</button>
                <button className="btn btn-primary" onClick={() => { setOpen(false); onGetStarted(); }}>Get Started</button>
              </>
            )}
          </div>
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              <button className="btn btn-ghost" onClick={onLogout}>Log out</button>
              <button className="btn btn-primary btn-sm" onClick={onGetStarted}>Open app</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onSignIn}>Sign In</button>
              <button className="btn btn-primary btn-sm" onClick={onGetStarted}>Get Started</button>
            </>
          )}
          <button className="burger" aria-label="Menu" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}

function HeroMock() {
  const [count, setCount] = useState(1);
  const feed = useRef(null);

  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) setCount((c) => (c >= CHAT.length ? 1 : c + 1));
    }, 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }, [count]);

  const speaking = CHAT[count - 1].from === "ai";

  return (
    <div className="mock glass">
      <div className="mock-bar">
        <i /><i /><i />
        <span className="rec"><b /> Live · 04:32</span>
      </div>
      <div className="mock-body">
        <div className="cam">
          <div className="cam-person" aria-hidden="true">
            <span className="head" /><span className="shoulders" />
          </div>
          <span className="cam-tag">You · Camera on</span>
          <span className={`mic ${speaking ? "" : "mic-live"}`}>{speaking ? "Waiting" : "Listening"}</span>
        </div>
        <div className="chat" ref={feed} aria-live="polite">
          {CHAT.slice(0, count).map((m, i) => (
            <p key={i} className={`bubble ${m.from}`}>
              <small>{m.from === "ai" ? "Recruiter" : "You"}</small>
              {m.text}
            </p>
          ))}
          {speaking && <span className="typing"><i /><i /><i /></span>}
        </div>
      </div>
    </div>
  );
}

function Hero({ onStart }) {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="eyebrow">🎯 AI mock interviews for placements</span>
        <h1>Meet the AI recruiter that actually wants you to succeed.</h1>
        <p>
          Upload your resume, turn on your camera, and experience a friendly, voice-driven
          mock interview tailored perfectly to your target company.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={onStart}>Try Your First Session</button>
          <a className="btn btn-ghost btn-lg" href="#how-it-works">See how it works</a>
        </div>
      </div>
      <HeroMock />
    </section>
  );
}

/* ---------- Feature cards ---------- */
function DurationCard() {
  const [mode, setMode] = useState(5);
  return (
    <article className="card glass reveal">
      <h3>Dual-duration engine</h3>
      <p>Pick a quick screening or a deeper technical round.</p>
      <div className="toggle" role="tablist">
        <span className="thumb" style={{ transform: `translateX(${mode === 5 ? 0 : 100}%)` }} />
        {[5, 10].map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{m} min</button>
        ))}
      </div>
      <p className="hint">
        {mode === 5 ? "Intro, one project deep-dive, one curveball." : "Full technical interrogation with follow-ups and edge cases."}
      </p>
    </article>
  );
}

function UploadCard() {
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);

  const pick = (f) => {
    if (!f) return;
    setFile(f.name);
    // BACKEND: send the file to your resume-parsing endpoint
    // const text = await fetch("/api/parse-resume", { method: "POST", body: formData }).then(r => r.json());
    // FIRESTORE: await setDoc(doc(db, "users", auth.currentUser.uid, "resume", "latest"), { text, updatedAt: serverTimestamp() });
  };

  return (
    <article className="card glass reveal">
      <h3>Resume-context parsing</h3>
      <p>Drop your resume so questions target your own projects.</p>
      <label
        className={`drop ${drag ? "drag" : ""} ${file ? "done" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
      >
        <input type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
        <span className="drop-icon">{file ? "✓" : "+"}</span>
        <span>{file ? file : drag ? "Release to upload" : "Drag a file here or tap to browse"}</span>
      </label>
    </article>
  );
}

function VoiceCard() {
  return (
    <article className="card glass reveal">
      <h3>Voice &amp; webcam grid</h3>
      <p>Your camera and mic open automatically. Your words appear as you speak.</p>
      {/* WebRTC: navigator.mediaDevices.getUserMedia({ video: true, audio: true }) */}
      {/* Speech: new (window.SpeechRecognition || window.webkitSpeechRecognition)() */}
      <div className="wave" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />)}
      </div>
      <p className="transcript">“I optimised the query using an index on…”</p>
    </article>
  );
}

function PersonaCard() {
  return (
    <article className="card glass reveal">
      <h3>Strict recruiter persona</h3>
      <p>Friendly room, serious interviewer. The rules it follows:</p>
      <ul className="rules">
        <li>Stays in character the whole interview</li>
        <li>No hints or compliments mid-round</li>
        <li>Challenges gaps in your technical answers</li>
        <li>Asks curveballs based on your resume</li>
      </ul>
      {/* BACKEND: this system prompt lives server-side, e.g. POST /api/interview/turn */}
    </article>
  );
}

function Features() {
  return (
    <section className="section" id="explore">
      <div className="section-head reveal">
        <span className="eyebrow">Explore</span>
        <h2>Everything you need to feel ready</h2>
        <p>Four tools that turn nerves into practice.</p>
      </div>
      <div className="grid-4">
        <DurationCard /><UploadCard /><VoiceCard /><PersonaCard />
      </div>
    </section>
  );
}

const STEPS = [
  ["Configure details", "Choose your company, select a duration and add your resume."],
  ["Enter the hot seat", "Allow camera and mic, then talk to the recruiter out loud."],
  ["Review the transcript", "See every question, every answer, and why the interview ended."],
];

function HowItWorks() {
  return (
    <section className="section" id="how-it-works">
      <div className="section-head reveal">
        <span className="eyebrow">How it works</span>
        <h2>Three steps to your first mock interview</h2>
      </div>
      <ol className="steps">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="step glass reveal" style={{ "--d": `${i * 120}ms` }}>
            <span className="step-n">{i + 1}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Contact section ---------- */
const EMAIL = "rajanikumarkunapa123@gmail.com";
const PHONE = "+91 8121203379";

const PATHS = {
  mail: (<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></>),
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  github: <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />,
  linkedin: (<><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" /></>),
};

// Edit the GitHub and LinkedIn links below with your real profile URLs
const CONTACTS = [
  { key: "mail", label: "Email", value: EMAIL, href: `mailto:${EMAIL}`, bg: "#e8daef", wide: true, copy: EMAIL },
  { key: "phone", label: "Call", value: PHONE, href: "tel:+918121203379", bg: "#e2f0d9", wide: true, copy: PHONE },
  { key: "github", label: "GitHub", value: "See my projects", href: "https://github.com", bg: "#d6e9f8", external: true },
  { key: "linkedin", label: "LinkedIn", value: "Let's connect", href: "https://linkedin.com", bg: "#fde8d7", external: true },
];

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked: the link still works */
    }
  };
  return (
    <button type="button" className={`ct-copy ${done ? "done" : ""}`} onClick={copy} aria-label={done ? "Copied" : `Copy ${label}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {done ? <path d="M5 13l4 4L19 7" /> : (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>)}
      </svg>
      <span className="ct-copy-text" aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="section-head reveal">
        <span className="eyebrow">Contact</span>
        <h2>Let&rsquo;s connect</h2>
        <p>Questions, feedback or want to collaborate? Reach out any way you like.</p>
      </div>

      <div className="ct-grid">
        <div className="ct-card glass reveal">
          <div className="ct-top">
            <Logo />
            <span className="ct-chip">🚀 Portfolio project</span>
          </div>
          <div>
            <h3>Built by a student, for students.</h3>
            <p>
              Hasta La Vista is a portfolio project conceptualised and built by a 3rd-year
              Software Engineering student. Feedback, ideas and collaboration are always welcome.
            </p>
          </div>
          <div>
            <a className="btn btn-primary" href={`mailto:${EMAIL}`}>Say hello</a>
          </div>
        </div>

        <div className="ct-tiles">
          {CONTACTS.map((c, n) => (
            <div key={c.key} className={`ct-tile glass reveal ${c.wide ? "wide" : ""}`} style={{ "--d": `${n * 90}ms` }}>
              <span className="ct-ico" style={{ background: c.bg }}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{PATHS[c.key]}</svg>
              </span>
              <span className="ct-meta">
                <small>{c.label}</small>
                <a className="ct-link" href={c.href} {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}>{c.value}</a>
              </span>
              {c.copy ? (
                <CopyButton text={c.copy} label={c.label.toLowerCase()} />
              ) : (
                <svg className="ct-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9" /></svg>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ct-bottom">
        <span>&copy; {new Date().getFullYear()} Hasta La Vista</span>
        <a href="#top">Back to top &uarr;</a>
      </div>
    </footer>
  );
}

export default function Landing({ user, onSignIn, onGetStarted, onLogout }) {
  useReveal();

  useEffect(() => {
    document.title = "Hasta La Vista | AI mock interviews for campus placements";
  }, []);

  return (
    <div className="page">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <Navbar user={user} onSignIn={onSignIn} onGetStarted={onGetStarted} onLogout={onLogout} />
      <main>
        <Hero onStart={onGetStarted} />
        <Features />
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}