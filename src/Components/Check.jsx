import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getSession, updateSession } from "../services/dataService";
import { validateCandidateName } from "../utils/nameValidation";
import Brand from "./Brand";
import "./Landing.css";
import "./Dashboard.css"; // holds the .splash loader used by App.jsx
import "./Prep.css";
import "./Check.css";

/* Browser capabilities */
const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const HAS_MEDIA = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const HAS_TTS = typeof window !== "undefined" && "speechSynthesis" in window;
const LOUD = 0.12; // mic level that counts as "heard you"

const CAM_TEXT = {
  idle: "Allow access so the recruiter can see you.",
  asking: "Waiting for your permission...",
  granted: "Camera is working.",
  denied: "Access was blocked. Click the camera icon in your address bar, choose Allow, then reload.",
  missing: "No camera or microphone found. Plug one in and try again.",
  busy: "Another app is using your camera or mic. Close it and try again.",
  error: "Couldn't start the camera. Reload the page and try again.",
  unsupported: "This page needs a secure connection (https) and a modern browser.",
};

const Svg = ({ children }) => <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
const MicIcon = () => <Svg><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></Svg>;
const CamIcon = () => <Svg><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></Svg>;

export default function Check() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(undefined); // undefined = loading, null = not found
  const [candidateName, setCandidateName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const [perm, setPerm] = useState(HAS_MEDIA ? "idle" : "unsupported");
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState("");
  const [micLabel, setMicLabel] = useState("");
  const [micOk, setMicOk] = useState(false);
  const [sttOk, setSttOk] = useState(false);
  const [sttError, setSttError] = useState("");
  const [heard, setHeard] = useState("");
  const [spk, setSpk] = useState("idle"); // idle | playing | asked | ok | unsupported

  const videoRef = useRef(null);
  const meterRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const recRef = useRef(null);
  const micOkRef = useRef(false);
  const sttOkRef = useRef(false);
  const sttActive = useRef(false);
  const speakingRef = useRef(false); // ignore mic and speech results while the speaker test plays
  const mediaGen = useRef(0); // discards getUserMedia results from superseded calls
  const spkTimer = useRef(null);
  const spkId = useRef(0);

  useEffect(() => {
    let off = false;
    getSession(user.uid, id)
      .then((s) => {
        if (off) return;
        setSession(s);
        if (s) {
          setCandidateName(s.candidateName || user.name || "");
        }
      })
      .catch(() => !off && setSession(null));
    return () => { off = true; };
  }, [id, user.uid, user.name]);

  const stopMedia = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopSpeech = useCallback(() => {
    sttActive.current = false;
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    recRef.current = null;
    clearTimeout(spkTimer.current);
    spkTimer.current = null;
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  // Always release the camera and mic when leaving the page. The generation bump
  // makes any permission prompt that resolves later stop its stream immediately.
  useEffect(() => () => {
    mediaGen.current += 1;
    stopMedia();
    stopSpeech();
  }, [stopMedia, stopSpeech]);

  const startMeter = useCallback((stream) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !stream.getAudioTracks().length) return;
    const ctx = new AC();
    ctxRef.current = ctx;
    ctx.resume?.();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let loud = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      meterRef.current?.style.setProperty("--lvl", lvl.toFixed(3)); // no re-render per frame
      if (!micOkRef.current && !speakingRef.current) {
        loud = lvl > LOUD ? loud + 1 : Math.max(0, loud - 1);
        if (loud > 10) { micOkRef.current = true; setMicOk(true); }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startSpeech = useCallback(() => {
    if (!SR || sttActive.current) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (recRef.current !== rec || speakingRef.current) return;
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      text = text.trim();
      if (!text) return;
      setHeard(text.slice(-110));
      if (!sttOkRef.current) { sttOkRef.current = true; setSttOk(true); setSttError(""); }
    };
    rec.onerror = (e) => {
      if (recRef.current !== rec) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      sttActive.current = false;
      if (sttOkRef.current) return;
      setSttError(
        e.error === "not-allowed" || e.error === "service-not-allowed" ? "Speech recognition was blocked. Allow the microphone and reload."
        : e.error === "network" ? "Speech recognition needs an internet connection."
        : "Speech recognition stopped working. Reload and try again."
      );
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      if (sttActive.current) {
        setTimeout(() => {
          if (recRef.current !== rec) return;
          try { rec.start(); } catch { /* busy */ }
        }, 250);
      }
    };
    recRef.current = rec;
    sttActive.current = true;
    try { rec.start(); } catch { /* already started */ }
  }, []);

  const startMedia = useCallback(async (cam) => {
    const gen = ++mediaGen.current;
    const stale = () => gen !== mediaGen.current;
    stopMedia();
    setPerm("asking");
    const audio = { echoCancellation: true, noiseSuppression: true };
    const video = { width: { ideal: 1280 }, height: { ideal: 720 }, ...(cam ? { deviceId: { exact: cam } } : { facingMode: "user" }) };
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      } catch (err) {
        if (err.name === "OverconstrainedError") stream = await navigator.mediaDevices.getUserMedia({ video: true, audio });
        else throw err;
      }
      // A newer request or an unmount happened while permission was pending.
      if (stale()) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      setPerm("granted");
      setMicLabel(stream.getAudioTracks()[0]?.label || "");
      setCamId(stream.getVideoTracks()[0]?.getSettings().deviceId || "");
      const list = await navigator.mediaDevices.enumerateDevices();
      if (stale()) return;
      setCams(list.filter((d) => d.kind === "videoinput"));
      startMeter(stream);
      startSpeech();
    } catch (err) {
      if (stale()) return;
      setPerm(
        err.name === "NotAllowedError" || err.name === "SecurityError" ? "denied"
        : err.name === "NotFoundError" ? "missing"
        : err.name === "NotReadableError" ? "busy"
        : "error"
      );
    }
  }, [stopMedia, startMeter, startSpeech]);

  const playTest = () => {
    if (!HAS_TTS) { setSpk("unsupported"); return; }
    const synth = window.speechSynthesis;
    const id = ++spkId.current;
    clearTimeout(spkTimer.current);
    synth.cancel();
    speakingRef.current = false;
    const u = new SpeechSynthesisUtterance("Hello. This is a speaker test. If you can hear me clearly, press yes.");
    u.lang = "en-IN";
    u.rate = 0.95;
    const done = () => {
      if (spkId.current !== id) return;
      clearTimeout(spkTimer.current);
      spkTimer.current = null;
      speakingRef.current = false;
      setSpk((s) => (s === "playing" ? "asked" : s));
    };
    u.onstart = () => {
      if (spkId.current !== id) return;
      speakingRef.current = true;
      setSpk("playing");
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
    spkTimer.current = setTimeout(() => {
      if (spkId.current !== id) return;
      synth.cancel();
      done();
    }, 9000); // safety net
  };

  if (session === undefined) return <div className="splash" />;
  if (!session) return <Navigate to="/app" replace />;

  const camOk = perm === "granted";
  const failed = ["denied", "missing", "busy", "error", "unsupported"].includes(perm);
  const spkOk = spk === "ok";
  const nameStatus = validateCandidateName(candidateName);
  const nameOk = nameStatus.valid;

  const left = [nameOk, camOk, micOk, sttOk, spkOk].filter((x) => !x).length;
  const ready = left === 0;

  const rows = [
    {
      key: "name", title: "Authorized identity",
      state: nameOk ? "ok" : nameTouched ? "fail" : "todo",
      text: nameOk
        ? `Confirmed: ${nameStatus.name}`
        : nameTouched && nameStatus.error
        ? nameStatus.error
        : "Confirm your authorized full name matching your official ID.",
    },
    {
      key: "cam", title: "Camera",
      state: camOk ? "ok" : failed ? "fail" : perm === "asking" ? "work" : "todo",
      text: CAM_TEXT[perm],
      action: failed && perm !== "unsupported" && <button className="btn btn-soft btn-sm" onClick={() => startMedia(camId)}>Try again</button>,
    },
    {
      key: "mic", title: "Microphone",
      state: micOk ? "ok" : camOk ? "work" : failed ? "fail" : "todo",
      text: micOk ? `We can hear you.${micLabel ? ` Using: ${micLabel}` : ""}` : camOk ? "Say hello out loud. The bar on the video should move." : "Needs microphone access.",
    },
    {
      key: "stt", title: "Voice to text",
      state: sttOk ? "ok" : !SR || sttError ? "fail" : camOk ? "work" : "todo",
      text: sttOk ? `\u201C${heard}\u201D`
        : !SR ? "This browser can't turn speech into text. Open this page in Chrome or Edge."
        : sttError ? sttError
        : camOk ? "Say: \u201CHello, I'm ready for my interview.\u201D Your words should appear here."
        : "Starts once your microphone is on.",
    },
    {
      key: "spk", title: "Speaker",
      state: spkOk ? "ok" : spk === "unsupported" ? "fail" : spk === "playing" || spk === "asked" ? "work" : "todo",
      text: spk === "ok" ? "Speaker works."
        : spk === "playing" ? "Playing..."
        : spk === "asked" ? "Did you hear it clearly?"
        : spk === "unsupported" ? "This browser can't play the recruiter's voice. Use Chrome or Edge."
        : "Play a sound to check you can hear the recruiter.",
      action: spk === "asked" ? (
        <>
          <button className="btn btn-soft btn-sm" onClick={() => setSpk("ok")}>Yes, I heard it</button>
          <button className="btn btn-ghost btn-sm" onClick={playTest}>Play again</button>
        </>
      ) : spk !== "unsupported" && (
        <button className="btn btn-soft btn-sm" onClick={playTest} disabled={spk === "playing"}>
          {spk === "ok" ? "Play again" : spk === "playing" ? "Playing..." : "Play test sound"}
        </button>
      ),
    },
  ];

  const handleJoin = async () => {
    if (!ready) return;
    stopMedia();
    stopSpeech();
    try {
      await updateSession(user.uid, id, { candidateName: nameStatus.name });
    } catch {
      /* offline mock resilient */
    }
    navigate(`/app/interview/${id}`);
  };

  const JoinButton = ({ className = "" }) => (
    <button className={`btn btn-primary ${className}`} onClick={handleJoin} disabled={!ready}>Join interview</button>
  );
  const status = ready
    ? "All checks passed. You're ready."
    : !nameOk
    ? "Confirm your authorized name to proceed"
    : `${left} ${left === 1 ? "check" : "checks"} left`;

  return (
    <div className="page prep">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />

      <header className="prep-bar">
        <div className="prep-bar-inner">
          <Link to="/" aria-label="Hasta La Vista home"><Brand /></Link>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/app")}>Back to edit</button>
        </div>
      </header>

      <main className="prep-main">
        <div className="prep-head">
          <h1>Check your setup.</h1>
          <p>{session.company} &middot; {session.role} &middot; {session.minutes} minutes. Make sure everything works before you enter the room.</p>
        </div>

        <div className="lobby">
          {/* ---------- Camera preview ---------- */}
          <div className="lobby-left" style={{ "--d": "0.1s" }}>
            <div className="stage">
              <video ref={videoRef} autoPlay playsInline muted />

              {!camOk && (
                <div className="stage-overlay">
                  <span className="stage-icon"><CamIcon /></span>
                  {perm === "asking" ? (
                    <><span className="spin" aria-label="Waiting" /><p>Waiting for permission...</p></>
                  ) : failed ? (
                    <p>{CAM_TEXT[perm]}</p>
                  ) : (
                    <>
                      <h2>Turn on your camera and microphone</h2>
                      <p>Your video stays on your device during this check.</p>
                      <button className="btn btn-primary btn-lg" onClick={() => startMedia(camId)}>Allow camera &amp; mic</button>
                    </>
                  )}
                </div>
              )}

              {camOk && (
                <>
                  <span className="stage-tag">You &middot; Camera on</span>
                  {heard && sttOk && <p className="caption">{heard}</p>}
                  <div className="meter" ref={meterRef} aria-hidden="true">
                    <span className="meter-ico"><MicIcon /></span>
                    <span className="meter-track"><span className="meter-fill" /></span>
                  </div>
                </>
              )}
            </div>

            {cams.length > 1 && (
              <label className="cam-select">
                <span>Camera</span>
                <select value={camId} onChange={(e) => { setCamId(e.target.value); startMedia(e.target.value); }}>
                  {cams.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
                </select>
              </label>
            )}
          </div>

          {/* ---------- Checklist ---------- */}
          <aside className="lobby-right">
            <div className="prep-card glass" style={{ "--d": "0.2s" }}>
              <div className="id-confirm-block">
                <h2>Candidate identity</h2>
                <p className="id-desc">
                  Confirm your authorized full name as it appears on your official college ID or accepted identity document.
                </p>
                <div className="id-field-wrap">
                  <label htmlFor="candidate-name-field" className="id-label">
                    Authorized full name <span className="req">*</span>
                  </label>
                  <input
                    id="candidate-name-field"
                    type="text"
                    className={`id-input ${nameTouched && !nameOk ? "has-error" : nameOk ? "is-valid" : ""}`}
                    value={candidateName}
                    placeholder="e.g. Rahul Sharma"
                    autoComplete="name"
                    onChange={(e) => {
                      setCandidateName(e.target.value);
                      if (!nameTouched) setNameTouched(true);
                    }}
                    onBlur={() => setNameTouched(true)}
                  />
                  {nameTouched && !nameOk && (
                    <p className="id-error" role="alert">{nameStatus.error}</p>
                  )}
                  {nameOk && (
                    <p className="id-valid">&#10003; Name confirmed for this session</p>
                  )}
                  <small className="id-disclaimer">
                    Note: Self-confirmed for session records. Automated document or government database verification is not performed.
                  </small>
                </div>
              </div>

              <h2 style={{ marginTop: "20px" }}>Setup checklist</h2>
              <ul className="checks">
                {rows.map((r, i) => (
                  <li key={r.key} className={`ck ${r.state}`}>
                    <span className="ck-dot" aria-hidden="true">{r.state === "ok" ? "\u2713" : r.state === "fail" ? "!" : i + 1}</span>
                    <div className="ck-body">
                      <b>{r.title}</b>
                      <small aria-live="polite">{r.text}</small>
                    </div>
                    {r.action && <div className="ck-act">{r.action}</div>}
                  </li>
                ))}
              </ul>

              <div className="start-inline">
                <JoinButton className="btn-lg" />
                <p className="hint-small">{status} Best in Chrome or Edge. These browsers process your speech on their own servers.</p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <div className="start-dock glass">
        <span className="dock-sum">{status}</span>
        <JoinButton />
      </div>
    </div>
  );
}