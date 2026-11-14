import { useEffect, useRef, useState, useCallback } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getProfile, patchProfile, getSession, updateSession } from "../services/dataService";
import { personaById, pickPersona, nextHistory } from "../data/personas";
import InitialsAvatar from "./InitialsAvatar";
import { createEngine, NO_ANSWER } from "../services/interviewBrain";
import { loadVoices, pickVoice, voiceSettings, speak, stopSpeaking, speechSignal } from "../utils/voices";
import {
  NON_RESPONSE_TIMEOUT_MS,
  FOLLOW_UP_1,
  FOLLOW_UP_2,
  CONCLUSION_LINE,
  TIME_CLOSING_LINE,
  isRepeatRequest,
} from "../utils/turnTaking";
import { createTurnController, decideAfterTurn, decideOnTimeUp } from "../utils/turnMachine";
import { createDeadline, remainingMs, elapsedFraction } from "../utils/interviewClock";
import { createCompletionGate, buildCompletedSession, resultsPath } from "../utils/completion";
import "./Landing.css";
import "./Dashboard.css";
import "./Prep.css";
import "./Interview.css";

const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const CONNECT_MS = 2200;
const BARS = [0.5, 0.8, 1, 0.7, 0.95, 0.6, 0.85, 0.55, 0.75];
const pad = (n) => String(n).padStart(2, "0");

export default function Interview() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(undefined);
  const [persona, setPersona] = useState(null);
  const [stage, setStage] = useState("intro");
  const [phase, setPhase] = useState("idle");
  const [turns, setTurns] = useState([]);
  const [subtitle, setSubtitle] = useState("");
  const [interim, setInterim] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [camError, setCamError] = useState("");
  const [starting, setStarting] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [srFailed, setSrFailed] = useState(false);
  const [typed, setTyped] = useState("");
  const [cameraInterrupted, setCameraInterrupted] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");

  // UI state
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const captionsEnabledRef = useRef(true);

  // Everything the async voice loop reads lives in refs
  const sessionRef = useRef(null);
  const personaRef = useRef(null);
  const engineRef = useRef(null);
  const voiceRef = useRef({});
  const phaseRef = useRef("idle");
  const endedRef = useRef(false);
  const startedRef = useRef(false);
  const autoRef = useRef(false);
  const deadlineRef = useRef(0);
  const deadlineTotalRef = useRef(0);
  const turnsRef = useRef([]);
  const recRef = useRef(null);
  const recActive = useRef(false);
  const finalRef = useRef("");
  const shownRef = useRef("");
  const srFailedRef = useRef(false);
  const timerRef = useRef(null);
  const autoStartTimer = useRef(null);
  const timeUpRef = useRef(false);
  const idleTimer = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const videoRef = useRef(null);
  const meterRef = useRef(null);
  const transcriptRef = useRef(null);
  const loadRef = useRef(null);

  // Mandatory Camera Circuit Breaker refs
  const cameraInterruptedRef = useRef(false);
  const reconnectingRef = useRef(false);
  const pausedPhaseRef = useRef("idle");
  const trackListenersCleanups = useRef([]);
  const watchdogTimer = useRef(null);
  const stageValRef = useRef("intro");
  const nonResponseTimer = useRef(null);
  const nonResponseActiveRef = useRef(false);
  const candidateSpokeRef = useRef(false);
  const isMutedRef = useRef(false);

  // Turn-taking guards
  const turnControllerRef = useRef(createTurnController());
  const completionGateRef = useRef(createCompletionGate());
  const submittingRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const aiRequestIdRef = useRef(0);

  // Callback refs for mutually recursive functions
  const sayRef = useRef(null);
  const finishRef = useRef(null);
  const startListeningRef = useRef(null);
  const handleCameraLostRef = useRef(null);
  const runTurnRef = useRef(null);
  const submitRef = useRef(null);
  const doRepeatRef = useRef(null);
  const armIdleRef = useRef(null);
  const startNonResponseSequenceRef = useRef(null);
  const candidateSpokeCallbackRef = useRef(null);
  const clearNonResponseTimerRef = useRef(null);
  const teardownRef = useRef(null);

  const ready = !!session && !!persona;

  useEffect(() => {
    stageValRef.current = stage;
  }, [stage]);

  const go = (p) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* ---------- Load session, assign the recruiter (once) ---------- */
  useEffect(() => {
    endedRef.current = false;
    let off = false;
    if (!loadRef.current) {
      loadRef.current = (async () => {
        const s = await getSession(user.uid, id);
        if (!s) return { s: null };
        if (s.status === "done") return { s, redirect: true };
        let p = personaById(s.personaId);
        let updatedSession = false;
        const patch = {};

        if (!p && s.status !== "live") {
          const profile = await getProfile(user.uid);
          p = pickPersona(profile.recruiterHistory);
          patch.personaId = p.id;
          await patchProfile(user.uid, { recruiterHistory: nextHistory(profile.recruiterHistory, p) });
          updatedSession = true;
        }

        if (typeof s.recruiterCameraOn !== "boolean") {
          patch.recruiterCameraOn = Math.random() < 0.5;
          s.recruiterCameraOn = patch.recruiterCameraOn;
          updatedSession = true;
        }

        if (updatedSession) {
          await updateSession(user.uid, id, patch);
        }
        return { s, p };
      })();
    }
    loadRef.current
      .then(({ s, p, redirect }) => {
        if (off) return;
        if (redirect) { navigate(`/app/results/${id}`, { replace: true }); return; }
        sessionRef.current = s;
        personaRef.current = p || null;
        setPersona(p || null);
        setSession(s);
        if (s) setSecondsLeft(s.minutes * 60);
      })
      .catch(() => { if (!off) setSession(null); });
    return () => { off = true; };
  }, [id, user.uid, navigate]);

  /* ---------- Pick the voice that matches the recruiter ---------- */
  useEffect(() => {
    if (!persona) return;
    let off = false;
    loadVoices().then((vs) => {
      if (off) return;
      const { voice, matched } = pickVoice(vs, persona.gender);
      voiceRef.current = { voice, ...voiceSettings(persona.gender, matched) };
    });
    return () => { off = true; };
  }, [persona]);

  /* ---------- Cleanup: always release camera, mic, speech and timers ---------- */
  const stopRec = useCallback(() => {
    recActive.current = false;
    try { recRef.current?.abort(); } catch { /* already stopped */ }
    recRef.current = null;
  }, []);

  const clearNonResponseTimer = useCallback(() => {
    clearTimeout(nonResponseTimer.current);
    nonResponseTimer.current = null;
    nonResponseActiveRef.current = false;
  }, []);

  const startNonResponseSequence = useCallback(async function() {
    if (endedRef.current || cameraInterruptedRef.current || nonResponseActiveRef.current) return;

    nonResponseActiveRef.current = true;
    candidateSpokeRef.current = false;

    const runStage = async (stageNum) => {
      if (endedRef.current || cameraInterruptedRef.current || candidateSpokeRef.current) {
        clearNonResponseTimerRef.current?.();
        return;
      }

      // The last stage hands over to finish(), which speaks the closing line once.
      if (stageNum >= 3) {
        finishRef.current?.(timeUpRef.current ? "time" : "no_response");
        return;
      }

      const followUpText = stageNum === 1 ? FOLLOW_UP_1 : FOLLOW_UP_2;

      // Stop listening while the recruiter speaks, so the TTS is not captured as an answer.
      stopRec();
      recognitionActiveRef.current = false;
      turnControllerRef.current?.stop();
      clearTimeout(idleTimer.current);

      await sayRef.current?.(followUpText);

      if (endedRef.current || cameraInterruptedRef.current) {
        clearNonResponseTimerRef.current?.();
        return;
      }

      // If the clock ran out while the follow-up was being spoken, conclude now.
      if (timeUpRef.current) {
        finishRef.current?.("time");
        return;
      }

      // Hand the floor back: the candidate can still answer this follow-up.
      startListeningRef.current?.();
      if (isMutedRef.current) {
        clearNonResponseTimerRef.current?.();
        return;
      }

      nonResponseTimer.current = setTimeout(() => {
        if (!candidateSpokeRef.current && !endedRef.current && !cameraInterruptedRef.current) {
          runStage(stageNum + 1);
        } else {
          clearNonResponseTimerRef.current?.();
        }
      }, NON_RESPONSE_TIMEOUT_MS);
    };

    await runStage(1);
  }
, [stopRec]);

  const candidateSpoke = useCallback(() => {
    candidateSpokeRef.current = true;
    clearNonResponseTimerRef.current?.();
  }, []);

  const teardown = useCallback(() => {
    aiRequestIdRef.current += 1;
    clearInterval(timerRef.current);
    timerRef.current = null;
    clearInterval(watchdogTimer.current);
    clearTimeout(idleTimer.current);
    clearTimeout(autoStartTimer.current);
    autoStartTimer.current = null;
    deadlineRef.current = 0;
    turnControllerRef.current?.stop();
    // Allow the auto-start effect to re-arm after a dev remount or a failed start.
    if (!startedRef.current) autoRef.current = false;
    clearNonResponseTimerRef.current?.();
    cancelAnimationFrame(rafRef.current);
    trackListenersCleanups.current.forEach((fn) => fn());
    trackListenersCleanups.current = [];
    stopRec();
    stopSpeaking();
    speechSignal.mic = 0;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopRec]);

  useEffect(() => () => { endedRef.current = true; teardownRef.current?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing the tab mid-interview
  useEffect(() => {
    if (stage !== "live") return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  // Handle hardware device changes
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = async () => {
      if (stageValRef.current !== "live" || cameraInterruptedRef.current || endedRef.current) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideo = devices.some((d) => d.kind === "videoinput");
        if (!hasVideo) {
          handleCameraLostRef.current?.();
        }
      } catch { /* ignore */ }
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, []);

  // Keep the transcript scrolled to the latest line
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, interim]);

  /* ---------- The conversation loop ---------- */
  const addTurn = useCallback((role, text) => {
    turnsRef.current = [...turnsRef.current, { role, text }];
    setTurns(turnsRef.current);
  }, []);

  /**
   * The clock has run out. Never cut off a question that has already been asked
   * or an answer that is still being processed: flag the timeout and let the
   * current turn hand over to finish() with the "time" reason. The 250ms ticker
   * stays alive so an in-progress answer can still be endpointed.
   */
  const handleTimeUp = useCallback(() => {
    if (endedRef.current || timeUpRef.current) return;
    timeUpRef.current = true;
    setSecondsLeft(0);
    const decision = decideOnTimeUp({
      phase: phaseRef.current,
      hasSpeech: turnControllerRef.current?.hasSpeech || false,
    });
    if (decision === "finish") {
      turnControllerRef.current?.stop();
      finishRef.current?.("time");
    }
  }, []);

  const say = useCallback(async (text, keepSubtitle = false) => {
    if (!keepSubtitle) setSubtitle(text);
    go("speaking");
    // The deadline keeps running during TTS. Time spent speaking is real
    // interview time and must never be silently added back to the clock.
    const v = voiceRef.current;
    await speak(text, { voice: v.voice, pitch: v.pitch, rate: v.rate });
  }, []);

  const runTurn = useCallback(async (candidateText) => {
    if (endedRef.current || cameraInterruptedRef.current) return;
    const requestId = ++aiRequestIdRef.current;
    go("thinking");

    // The deadline expired while the candidate was answering the active question:
    // the answer is already in the transcript, so close instead of asking another.
    if (timeUpRef.current) { finishRef.current?.("time"); return; }

    const left = remainingMs(deadlineRef.current, Date.now());
    const frac = elapsedFraction(deadlineRef.current, deadlineTotalRef.current, Date.now());
    const ph = frac < 0.4 ? "resume" : frac < 0.82 ? "technical" : "wrapup";
    let reply;
    try {
      reply = await engineRef.current.next({ candidateText, phase: ph, secondsLeft: left / 1000 });
    } catch {
      reply = { text: "Let us continue. Tell me more about your most recent project." };
    }

    // A newer turn, a manual end, or a camera interruption makes this reply stale.
    if (requestId !== aiRequestIdRef.current) return;
    if (endedRef.current || cameraInterruptedRef.current) return;

    // The deadline expired while Groq was thinking. Do not ask another question.
    if (decideAfterTurn({
      timeUp: timeUpRef.current,
      remainingMs: remainingMs(deadlineRef.current, Date.now()),
      replyEnd: !!reply?.end,
    }) === "finish") {
      finishRef.current?.("time");
      return;
    }

    let text = String(reply?.text || "").trim() || "Let us keep going. Tell me about a decision you made recently and why.";
    // Defence in depth: an engine must never close the interview while time remains.
    if (reply?.end) {
      text = "Let us keep exploring that. What is one part of that work you would approach differently today?";
    }

    addTurn("ai", text);
    await sayRef.current?.(text);
    if (requestId !== aiRequestIdRef.current) return;
    if (endedRef.current || cameraInterruptedRef.current) return;

    // The deadline passed while the question was being spoken; it was delivered in
    // full, so close now rather than starting another turn.
    if (decideAfterTurn({
      timeUp: timeUpRef.current,
      remainingMs: remainingMs(deadlineRef.current, Date.now()),
      replyEnd: !!reply?.end,
    }) === "finish") {
      finishRef.current?.("time");
      return;
    }

    clearNonResponseTimerRef.current?.();
    startListeningRef.current?.();
  }, [addTurn]);

  const doRepeat = useCallback(async () => {
    if (endedRef.current || cameraInterruptedRef.current) return;
    const last = [...turnsRef.current].reverse().find((t) => t.role === "ai");
    if (last) await sayRef.current?.(last.text);
    if (endedRef.current || cameraInterruptedRef.current) return;
    if (timeUpRef.current) { finishRef.current?.("time"); return; }
    startListeningRef.current?.();
  }, []);

  const submit = useCallback((manual, action) => {
    if (phaseRef.current !== "listening" || endedRef.current || cameraInterruptedRef.current) return;
    if (submittingRef.current) return;

    const controller = turnControllerRef.current;
    const currentTurn = controller?.turnId ?? 0;
    // A tick from a previous turn must never submit the current answer.
    if (action && action.turnId !== currentTurn) return;

    const text = String(manual ?? action?.text ?? controller?.text ?? shownRef.current ?? "").trim();
    if (!manual && !text) return;
    // Claim the one allowed submission for this turn before doing anything async.
    if (!controller?.markSubmitted(currentTurn)) return;

    submittingRef.current = true;
    go("thinking");
    clearTimeout(idleTimer.current);
    clearNonResponseTimerRef.current?.();
    stopRec();
    recognitionActiveRef.current = false;

    finalRef.current = "";
    shownRef.current = "";
    setInterim("");
    setTyped("");

    if (text && isRepeatRequest(text)) {
      submittingRef.current = false;
      doRepeatRef.current?.();
      return;
    }

    const answer = text || NO_ANSWER;
    addTurn("user", answer);
    candidateSpokeCallbackRef.current?.();
    submittingRef.current = false;
    runTurnRef.current?.(answer);
  }, [addTurn, stopRec]);

  /**
   * One 250ms tick drives both authoritative values: the countdown and the
   * end-of-answer detector. There is no separate silence timer to race against it.
   */
  const startClock = useCallback(() => {
    clearInterval(timerRef.current);
    const tick = () => {
      const left = remainingMs(deadlineRef.current, Date.now());
      setSecondsLeft(Math.ceil(left / 1000));
      if (left <= 0) handleTimeUp();

      if (phaseRef.current !== "listening" || endedRef.current || cameraInterruptedRef.current) return;
      const action = turnControllerRef.current?.evaluate({
        now: Date.now(),
        phase: phaseRef.current,
        speaking: speechSignal.speaking,
        muted: isMutedRef.current,
        interrupted: cameraInterruptedRef.current,
        ended: endedRef.current,
      });
      if (action?.type === "submit") submitRef.current?.(undefined, action);
    };
    tick();
    timerRef.current = setInterval(tick, 250);
  }, [handleTimeUp]);

  // Idle timer: if candidate says nothing for a while, trigger non-response sequence
  const armIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (srFailedRef.current) {
      // Speech recognition is unavailable and the candidate is using the typed
      // fallback. If nothing arrives for 90 seconds, record a non-answer so the
      // room can never hang waiting on input that cannot come.
      idleTimer.current = setTimeout(() => submitRef.current?.(NO_ANSWER), 90000);
      return;
    }
    idleTimer.current = setTimeout(() => {
      if (!candidateSpokeRef.current && phaseRef.current === "listening" && !submittingRef.current) {
        startNonResponseSequenceRef.current?.();
      }
    }, NON_RESPONSE_TIMEOUT_MS);
  }, []);

  const failVoice = useCallback(() => { srFailedRef.current = true; setSrFailed(true); }, []);

  const startListening = useCallback(() => {
    if (endedRef.current || cameraInterruptedRef.current) return;
    if (timeUpRef.current) { finishRef.current?.("time"); return; }
    finalRef.current = "";
    shownRef.current = "";
    candidateSpokeRef.current = false;
    turnControllerRef.current.begin();
    setInterim("");
    go("listening");
    // While muted there is nothing to listen to; unmuting calls back into this function.
    if (isMutedRef.current) return;
    if (!SR) { failVoice(); return; }
    armIdleRef.current?.();
    stopRec();
    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      if (recRef.current !== rec || cameraInterruptedRef.current || submittingRef.current || endedRef.current) return;
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          finalRef.current += r[0].transcript + " ";
        } else {
          live += r[0].transcript;
        }
      }
      const shown = (finalRef.current + live).trim();
      const latestIsFinal = e.results.length ? !!e.results[e.results.length - 1].isFinal : false;
      shownRef.current = shown;
      if (captionsEnabledRef.current) setInterim(shown);
      if (shown) {
        // Every result, including an interim one, proves the candidate is still
        // talking. Resetting the endpoint clock here is what makes natural pauses,
        // breathing and thinking safely shorter than the submission wait.
        turnControllerRef.current.noteSpeech(shown, Date.now(), latestIsFinal);
        candidateSpokeCallbackRef.current?.();
        clearTimeout(idleTimer.current);
        recognitionActiveRef.current = true;
      }
    };
    rec.onerror = (e) => {
      if (recRef.current !== rec) return;
      if (e.error === "no-speech" || e.error === "aborted" || cameraInterruptedRef.current) return;
      recActive.current = false;
      recognitionActiveRef.current = false;
      failVoice();
    };
    rec.onend = () => {
      if (recRef.current !== rec) return;
      recognitionActiveRef.current = false;
      // Restarting recognition must never submit an answer on its own. The
      // endpoint tick still holds the accumulated text and waits for real silence.
      if (recActive.current && phaseRef.current === "listening" && !isMutedRef.current && !cameraInterruptedRef.current && !endedRef.current && !submittingRef.current) {
        setTimeout(() => {
          if (recRef.current !== rec) return;
          try { rec.start(); } catch { /* busy */ }
        }, 200);
      }
    };
    recRef.current = rec;
    recActive.current = true;
    try { rec.start(); } catch { }
  }, [failVoice, stopRec]);

  const finish = useCallback(async (reason) => {
    if (endedRef.current || !completionGateRef.current.request()) return;
    endedRef.current = true;
    // Invalidate any in-flight Groq reply so it cannot speak after the close.
    aiRequestIdRef.current += 1;
    clearInterval(timerRef.current);
    timerRef.current = null;
    clearTimeout(idleTimer.current);
    clearNonResponseTimerRef.current?.();
    turnControllerRef.current?.stop();
    stopRec();
    stopSpeaking();
    speechSignal.mic = 0;
    setConfirmEnd(false);
    setInterim("");
    go("idle");
    setStage("closing");

    const closing = reason === "no_response"
      ? CONCLUSION_LINE
      : reason === "time"
        ? TIME_CLOSING_LINE
        : "";

    if (closing) {
      addTurn("ai", closing);
      setSubtitle(closing);
      go("speaking");
      const v = voiceRef.current;
      await speak(closing, { voice: v.voice, pitch: v.pitch, rate: v.rate });
    }

    // Never persist an empty transcript, even if the interview is ended in the
    // first instant before the greeting was added.
    const payload = buildCompletedSession({
      turns: turnsRef.current,
      reason,
      endedAt: Date.now(),
      fallbackLine: closing || TIME_CLOSING_LINE,
    });
    try {
      await updateSession(user.uid, id, payload);
    } catch (err) {
      console.error("[interview] The finished interview could not be saved to Firestore.", err);
    }
    teardownRef.current?.();
    navigate(resultsPath(id), { replace: true });
  }, [addTurn, navigate, id, user.uid, stopRec]);

  // Live mic level for the voice bars
  const startMeter = useCallback((stream) => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !stream.getAudioTracks().length) return;
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close().catch(() => {});
    const ctx = new AC();
    ctxRef.current = ctx;
    ctx.resume?.();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      meterRef.current?.style.setProperty("--lvl", level.toFixed(3));
      speechSignal.mic = level;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  /* ---------- Mandatory Candidate Camera Enforcement & Recovery ---------- */
  const handleCameraLost = useCallback(() => {
    if (cameraInterruptedRef.current || endedRef.current || stageValRef.current !== "live") return;
    cameraInterruptedRef.current = true;
    setCameraInterrupted(true);
    setReconnectError("");

    // The deadline is wall-clock time; a camera interruption must not add time
    // back. Keep the single ticker alive so the interview can still expire
    // safely while the candidate is reconnecting.
    turnControllerRef.current?.stop();
    stopRec();
    stopSpeaking();
    speechSignal.mic = 0;

    clearTimeout(idleTimer.current);
    clearNonResponseTimerRef.current?.();

    pausedPhaseRef.current = phaseRef.current;
    go("idle");
  }, [stopRec]);

  // Populate callback refs after all callbacks are defined
  useEffect(() => {
    startNonResponseSequenceRef.current = startNonResponseSequence;
    candidateSpokeCallbackRef.current = candidateSpoke;
    teardownRef.current = teardown;
    sayRef.current = say;
    finishRef.current = finish;
    startListeningRef.current = startListening;
    handleCameraLostRef.current = handleCameraLost;
    runTurnRef.current = runTurn;
    submitRef.current = submit;
    doRepeatRef.current = doRepeat;
    armIdleRef.current = armIdle;
    clearNonResponseTimerRef.current = clearNonResponseTimer;
  }, [startNonResponseSequence, candidateSpoke, teardown, say, finish, startListening, handleCameraLost, runTurn, submit, doRepeat, armIdle, clearNonResponseTimer]);

  const attachVideoTrackWatchers = useCallback((track) => {
    if (!track) return;
    trackListenersCleanups.current.forEach((fn) => fn());
    trackListenersCleanups.current = [];

    const onEnded = () => {
      handleCameraLostRef.current?.();
    };

    let muteTimer = null;
    const onMute = () => {
      clearTimeout(muteTimer);
      muteTimer = setTimeout(() => {
        if (track.muted && track.readyState !== "ended" && !endedRef.current) {
          handleCameraLostRef.current?.();
        }
      }, 2000);
    };

    const onUnmute = () => {
      clearTimeout(muteTimer);
    };

    track.addEventListener("ended", onEnded);
    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);

    trackListenersCleanups.current.push(() => {
      clearTimeout(muteTimer);
      track.removeEventListener("ended", onEnded);
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    });
  }, []);

  const startCameraWatchdog = useCallback(() => {
    clearInterval(watchdogTimer.current);
    watchdogTimer.current = setInterval(() => {
      if (endedRef.current || cameraInterruptedRef.current || stageValRef.current !== "live") return;
      const vTrack = streamRef.current?.getVideoTracks()?.[0];
      if (!vTrack || vTrack.readyState === "ended" || !vTrack.enabled) {
        handleCameraLostRef.current?.();
      }
    }, 1000);
  }, []);

  const reconnectCamera = useCallback(async () => {
    if (reconnectingRef.current || endedRef.current) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    setReconnectError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera devices are not supported in this browser.");
      }

      // Keep the live audio track, then release the old camera before asking for a
      // new one so some devices don't stay locked by the interrupted stream.
      const currentStream = streamRef.current;
      let audioTrack = currentStream?.getAudioTracks()?.find((t) => t.readyState === "live") || null;
      const hadLiveAudio = !!audioTrack;
      currentStream?.getVideoTracks()?.forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
      if (videoRef.current) videoRef.current.srcObject = null;

      let videoStream;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
      } catch (err) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          throw new Error("Camera access was denied. Please allow camera permissions in your browser address bar and click Reconnect Camera.");
        }
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          throw new Error("No camera device was detected. Please plug in or connect your camera and try again.");
        }
        if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          throw new Error("Camera is currently in use by another application. Please close other software using the camera and try again.");
        }
        throw new Error(err.message || "Could not access camera. Please check your device and try again.");
      }

      const newVideoTrack = videoStream.getVideoTracks()[0];
      if (!newVideoTrack || newVideoTrack.readyState !== "live") {
        throw new Error("Acquired camera track is not active. Please try again.");
      }

      if (!audioTrack) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          audioTrack = audioStream.getAudioTracks()[0];
        } catch {
          /* microphone reacquisition best-effort */
        }
      }

      // Keep the mute toggle in sync when the microphone track is replaced.
      if (audioTrack) audioTrack.enabled = !isMutedRef.current;

      const tracks = [newVideoTrack];
      if (audioTrack) tracks.push(audioTrack);
      const restoredStream = new MediaStream(tracks);
      streamRef.current = restoredStream;

      if (videoRef.current) {
        videoRef.current.srcObject = restoredStream;
        await videoRef.current.play().catch(() => {});
      }

      if (audioTrack && (!hadLiveAudio || !ctxRef.current || ctxRef.current.state === "closed")) {
        cancelAnimationFrame(rafRef.current);
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
        startMeter(restoredStream);
      }

      attachVideoTrackWatchers(newVideoTrack);

      await new Promise((resolve) => {
        if (videoRef.current && videoRef.current.videoWidth > 0) return resolve();
        const onLoaded = () => {
          videoRef.current?.removeEventListener("loadedmetadata", onLoaded);
          resolve();
        };
        videoRef.current?.addEventListener("loadedmetadata", onLoaded);
        setTimeout(resolve, 600);
      });

      // The interview may have closed while the camera was being restored.
      if (endedRef.current) {
        restoredStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* ignore */ } });
        return;
      }

      cameraInterruptedRef.current = false;
      setCameraInterrupted(false);
      setReconnecting(false);
      reconnectingRef.current = false;

      const left = remainingMs(deadlineRef.current, Date.now());
      setSecondsLeft(Math.ceil(left / 1000));

      // The clock ran out while the camera was being restored. There is no
      // question left to protect (the room is paused), so close cleanly.
      if (timeUpRef.current || left <= 0) {
        handleTimeUp();
        return;
      }

      const prevPhase = pausedPhaseRef.current;
      if (prevPhase === "listening") {
        go("listening");
        startListeningRef.current?.();
      } else if (prevPhase === "speaking" || prevPhase === "thinking") {
        const lastAiTurn = [...turnsRef.current].reverse().find((t) => t.role === "ai");
        if (lastAiTurn?.text) {
          await sayRef.current?.(lastAiTurn.text);
          if (!endedRef.current && !cameraInterruptedRef.current) {
            if (timeUpRef.current) finishRef.current?.("time");
            else startListeningRef.current?.();
          }
        } else {
          // Interrupted before the first question was generated.
          runTurnRef.current?.(null);
        }
      } else {
        startListeningRef.current?.();
      }
    } catch (err) {
      setReconnecting(false);
      reconnectingRef.current = false;
      setReconnectError(err.message || "Failed to reconnect camera. Please try again.");
    }
  }, [startMeter, attachVideoTrackWatchers, handleTimeUp]);

  const beginInterview = useCallback(async () => {
    if (endedRef.current || startedRef.current) return;
    startedRef.current = true;
    timeUpRef.current = false;
    setStarting(true);
    setCamError("");
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no media");
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      startedRef.current = false;
      setStarting(false);
      setStage("intro");
      setCamError("We couldn't turn on your camera and microphone. Allow access in your browser, then try again.");
      return;
    }
    if (endedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
    startMeter(stream);

    const vTrack = stream.getVideoTracks()[0];
    if (vTrack) {
      attachVideoTrackWatchers(vTrack);
    }
    startCameraWatchdog();

    // One authoritative start instant and deadline for the whole interview.
    // Nothing later may reset, pause, or rebase these values.
    const startedAt = Date.now();
    const { deadline, totalMs } = createDeadline(startedAt, sessionRef.current.minutes);
    deadlineRef.current = deadline;
    deadlineTotalRef.current = totalMs;
    timeUpRef.current = false;
    aiRequestIdRef.current += 1;

    updateSession(user.uid, id, { status: "live", startedAt }).catch(() => {});
    engineRef.current = createEngine({ session: sessionRef.current, persona: personaRef.current });
    setSecondsLeft(Math.ceil(totalMs / 1000));
    startClock();
    setStage("live");
    setStarting(false);
    runTurnRef.current?.(null);
  }, [startMeter, attachVideoTrackWatchers, startCameraWatchdog, id, user.uid, startClock]);

  // Auto-start after prep page
  useEffect(() => {
    if (!ready || autoRef.current || sessionRef.current?.status === "live") return;
    autoRef.current = true;
    if (navigator.userActivation?.hasBeenActive) {
      setStage("connecting");
      autoStartTimer.current = setTimeout(() => {
        autoStartTimer.current = null;
        beginInterview();
      }, CONNECT_MS);
    }
  }, [ready, session, persona, beginInterview]);

  /* ---------- Toggle handlers ---------- */
  const toggleMic = useCallback(() => {
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    isMutedRef.current = newMuted;
    const audioTrack = streamRef.current?.getAudioTracks()?.[0];
    if (audioTrack) {
      audioTrack.enabled = !newMuted;
    }
    if (newMuted) {
      stopRec();
      turnControllerRef.current?.stop();
      clearTimeout(idleTimer.current);
      clearNonResponseTimerRef.current?.();
    } else if (phaseRef.current === "listening" && !cameraInterruptedRef.current && !endedRef.current) {
      startListeningRef.current?.();
    }
  }, [micMuted, stopRec]);

  const toggleCaptions = useCallback(() => {
    const newEnabled = !captionsEnabled;
    captionsEnabledRef.current = newEnabled;
    setCaptionsEnabled(newEnabled);
    if (!newEnabled) setInterim("");
  }, [captionsEnabled]);

  const toggleTranscript = useCallback(() => {
    setTranscriptOpen((prev) => !prev);
    setInfoOpen(false); // only one drawer at a time
  }, []);

  const toggleInfo = useCallback(() => {
    setInfoOpen((prev) => !prev);
    setTranscriptOpen(false);
  }, []);

  /* ---------- Render ---------- */
  if (session === undefined) return <div className="splash" />;
  if (!session) return <Navigate to="/app" replace />;

  if (session.status === "live" && stage === "intro") {
    return (
      <div className="page">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
        <div className="dash">
          <div className="dash-card glass">
            <h1>This interview was interrupted.</h1>
            <p>A live interview can&rsquo;t be resumed once it has started. Start a fresh one from the prep page.</p>
            <div className="dash-actions"><button className="btn btn-primary" onClick={() => navigate("/app")}>Back to prep</button></div>
          </div>
        </div>
      </div>
    );
  }
  if (!persona) return <Navigate to="/app" replace />;

  const first = persona.name.split(" ")[0];
  const candidateName = (session.candidateName || user?.name || "Candidate").trim();
  const live = stage === "live";
  const timerClass = secondsLeft <= 15 && live ? "urgent" : secondsLeft <= 60 && live ? "warn" : "";
  const hint =
    cameraInterrupted ? "Camera feed interrupted. Reconnect camera to resume."
    : stage === "intro" ? "Press start. After that, it's voice only."
    : stage === "connecting" ? "Connecting..."
    : stage === "closing" ? "Interview finished. Preparing your results..."
    : phase === "speaking" ? `${first} is speaking.`
    : phase === "thinking" ? "One moment..."
    : interim ? "Go on, I'm listening."
    : "Your turn. Just speak.";

  return (
    <div className="page room">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />

      {/* Professional Meeting Header */}
      <header className="meeting-header" role="banner">
        <div className="header-left">
          <div className="meeting-info">
            <h1 className="company-name">{session.company}</h1>
            <span className="role-badge">{session.role}</span>
          </div>
          <div className="connection-status" data-status="connected">
            <span className="status-dot" aria-hidden="true"></span>
            <span>Connected</span>
          </div>
        </div>
        <div className="header-center">
          <div className={`meeting-timer ${timerClass}`} role="timer" aria-label={`Time remaining: ${pad(Math.floor(secondsLeft / 60))} minutes ${pad(secondsLeft % 60)} seconds`}>
            {pad(Math.floor(secondsLeft / 60))}:{pad(secondsLeft % 60)}
          </div>
        </div>
        <div className="header-right">
          <button 
            className="btn btn-ghost btn-sm header-btn" 
            onClick={toggleTranscript}
            aria-pressed={transcriptOpen}
            aria-label={transcriptOpen ? "Close transcript" : "Open transcript"}
            disabled={!live}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span>Transcript</span>
          </button>
          <button 
            className="btn btn-ghost btn-sm header-btn" 
            onClick={toggleInfo}
            aria-pressed={infoOpen}
            aria-label={infoOpen ? "Close meeting info" : "Open meeting info"}
            disabled={!live}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Info</span>
          </button>
          <button 
            className="btn btn-danger btn-sm header-btn" 
            onClick={() => setConfirmEnd(true)}
            disabled={!live}
            aria-label="End interview"
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2v20"/><path d="M15 2v20"/><path d="M21 12H3"/><path d="M21 12a2 2 0 0 0-2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/></svg>
            <span>Leave</span>
          </button>
        </div>
      </header>

      {/* Main Meeting Area */}
      <main className="meeting-main">
        {/* Participant Gallery */}
        <section className="participant-gallery" aria-label="Participants">
          {/* Recruiter Tile (Left) */}
          <article className="participant-tile recruiter-tile" data-speaking={phase === "speaking"}>
            <div className="tile-video" aria-label={`${persona.name} video`}>
              <InitialsAvatar persona={persona} phase={phase} />
            </div>
            <div className="tile-overlay">
              <div className="tile-name">
                <span className="name">{persona.name}</span>
                <span className="title">{persona.title}</span>
              </div>
              <div className="tile-indicators">
                <div className="mic-indicator" data-active={phase === "speaking"} aria-label={phase === "speaking" ? "Recruiter speaking" : "Recruiter muted"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                </div>
              </div>
            </div>
          </article>

          {/* Candidate Tile (Right) */}
          <article className="participant-tile candidate-tile" data-speaking={phase === "listening" && !micMuted}>
            <div className="tile-video" aria-label={`${candidateName} video`}>
              <video ref={videoRef} autoPlay playsInline muted className="candidate-video" />
            </div>
            <div className="tile-overlay">
              <div className="tile-name">
                <span className="name">{candidateName}</span>
                <span className="title">Candidate</span>
              </div>
              <div className="tile-indicators">
                <div className={`mic-indicator ${micMuted ? "muted" : ""}`} data-active={phase === "listening" && !micMuted} aria-label={micMuted ? "Microphone muted" : "Microphone active"}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                  {micMuted && <span className="mic-slash" aria-hidden="true"></span>}
                </div>
                <div className="camera-active-indicator" aria-label="Camera active">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
              </div>
            </div>
          </article>
        </section>

        {/* Live Captions */}
        {captionsEnabled && (subtitle || interim) && (
          <section className="live-captions" aria-live="polite" aria-label="Live captions">
            <div className="captions-content">
              {subtitle && <p className="caption-line speaker">{subtitle}</p>}
              {interim && phase === "listening" && <p className="caption-line interim">{interim}</p>}
            </div>
          </section>
        )}

        {/* Intro / Connecting / Closing Overlays */}
        {(stage === "intro" || stage === "connecting") && (
          <div className="stage-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
            <div className="overlay-card glass">
              {stage === "connecting" ? (
                <>
                  <span className="spin" aria-label="Connecting" />
                  <h2 id="intro-title">Connecting you to {first}...</h2>
                  <p>Your camera and microphone are turning on. The whole interview is voice only, so just talk naturally.</p>
                </>
              ) : (
                <>
                  <h2 id="intro-title">{first} is ready.</h2>
                  <p>Once you start, the whole interview is voice to voice. No clicking, just talk. You have {session.minutes} minutes and the clock starts now.</p>
                  {camError && <p className="intro-error" role="alert">{camError}</p>}
                  <button className="btn btn-primary btn-lg" onClick={beginInterview} disabled={starting}>
                    {starting ? <span className="spin" aria-label="Starting" /> : "Start interview"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {stage === "closing" && (
          <div className="stage-overlay" role="status" aria-live="polite">
            <div className="overlay-card glass">
              <span className="spin" aria-label="Processing" />
              <h2>Interview finished</h2>
              <p>Preparing your results...</p>
            </div>
          </div>
        )}

        {/* Camera Interrupted Overlay */}
        {cameraInterrupted && (
          <div className="camera-interrupted-overlay" role="alertdialog" aria-modal="true" aria-labelledby="cam-interrupted-title">
            <div className="camera-interrupted-card glass">
              <div className="cam-warn-icon" aria-hidden="true">&#9888;</div>
              <h2 id="cam-interrupted-title">Camera Feed Interrupted</h2>
              <p className="cam-interrupted-desc">
                A continuous live camera feed is strictly required for this interview. The interview timer, current question, and transcript have been safely paused.
              </p>
              {reconnectError && (
                <div className="cam-interrupted-error" role="alert">
                  {reconnectError}
                </div>
              )}
              <div className="cam-interrupted-actions">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={reconnectCamera}
                  disabled={reconnecting}
                >
                  {reconnecting ? (
                    <><span className="spin" aria-label="Reconnecting" /> Reconnecting...</>
                  ) : (
                    "Reconnect Camera"
                  )}
                </button>
              </div>
              <small className="cam-interrupted-hint">
                Ensure your camera is connected and permitted in your browser settings.
              </small>
            </div>
          </div>
        )}

        {/* End Confirmation Modal */}
        {confirmEnd && (
          <div className="room-confirm" onMouseDown={(e) => e.target === e.currentTarget && setConfirmEnd(false)}>
            <div className="confirm-card glass" role="dialog" aria-modal="true" aria-labelledby="end-title">
              <h2 id="end-title">End the interview now?</h2>
              <p>Your answers so far will be saved. You can&rsquo;t resume afterwards.</p>
              <div className="dash-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>Keep going</button>
                <button className="btn btn-primary" onClick={() => finish("left")}>End now</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Toolbar */}
      <footer className="meeting-toolbar" role="toolbar" aria-label="Meeting controls">
        <div className="toolbar-group toolbar-left">
          <button
            className={`toolbar-btn ${micMuted ? "active muted" : ""}`}
            onClick={toggleMic}
            aria-pressed={micMuted}
            aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
            disabled={!live || cameraInterrupted}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              {micMuted && <line x1="1" y1="1" x2="23" y2="23" className="slash" />}
            </svg>
            <span className="btn-label">{micMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            className={`toolbar-btn ${captionsEnabled ? "active" : ""}`}
            onClick={toggleCaptions}
            aria-pressed={captionsEnabled}
            aria-label={captionsEnabled ? "Disable captions" : "Enable captions"}
            disabled={!live}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 12h12"/><path d="M6 8h10"/><path d="M6 16h8"/></svg>
            <span className="btn-label">Captions</span>
          </button>
        </div>
        <div className="toolbar-group toolbar-center">
          <div className="voice-indicator" ref={meterRef} aria-hidden="true">
            {BARS.map((m, i) => <i key={i} style={{ "--m": m }} />)}
          </div>
          <p className="toolbar-hint" aria-live="polite">{hint}</p>
        </div>
        <div className="toolbar-group toolbar-right">
          <button
            className={`toolbar-btn ${transcriptOpen ? "active" : ""}`}
            onClick={toggleTranscript}
            aria-pressed={transcriptOpen}
            aria-label={transcriptOpen ? "Close transcript" : "Open transcript"}
            disabled={!live}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span className="btn-label">Transcript</span>
          </button>
          <button
            className={`toolbar-btn ${infoOpen ? "active" : ""}`}
            onClick={toggleInfo}
            aria-pressed={infoOpen}
            aria-label={infoOpen ? "Close meeting info" : "Open meeting info"}
            disabled={!live}
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span className="btn-label">Info</span>
          </button>
          <button
            className="toolbar-btn btn-end"
            onClick={() => setConfirmEnd(true)}
            disabled={!live}
            aria-label="End interview"
          >
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2v20"/><path d="M15 2v20"/><path d="M21 12H3"/><path d="M21 12a2 2 0 0 0-2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/></svg>
            <span className="btn-label">Leave</span>
          </button>
        </div>
      </footer>

      {/* Transcript Drawer (Desktop) / Bottom Sheet (Mobile) */}
      {(transcriptOpen || infoOpen) && (
        <aside className={`side-drawer ${transcriptOpen ? "transcript" : "info"}`} role="dialog" aria-modal="false" aria-label={transcriptOpen ? "Conversation transcript" : "Meeting information"}>
          <div className="drawer-header">
            <h2>{transcriptOpen ? "Conversation" : "Meeting Information"}</h2>
            <button className="drawer-close" onClick={transcriptOpen ? () => setTranscriptOpen(false) : () => setInfoOpen(false)} aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="drawer-content">
            {transcriptOpen ? (
              <ul className="transcript" ref={transcriptRef}>
                {turns.length === 0 && <li className="empty">Your conversation appears here.</li>}
                {turns.map((t, i) => (
                  <li key={i} className={`bub ${t.role}`}>
                    <small>{t.role === "ai" ? persona.name : candidateName}</small>
                    {t.text === NO_ANSWER ? <em>No answer</em> : t.text}
                  </li>
                ))}
                {interim && phase === "listening" && <li className="bub user live"><small>{candidateName}</small>{interim}</li>}
              </ul>
            ) : (
              <div className="meeting-info-panel">
                <dl className="info-list">
                  <dt>Company</dt>
                  <dd>{session.company}</dd>
                  <dt>Role</dt>
                  <dd>{session.role}</dd>
                  <dt>Duration</dt>
                  <dd>{session.minutes} minutes</dd>
                  <dt>Recruiter</dt>
                  <dd>{persona.name}, {persona.title}</dd>
                  <dt>Recruiter Camera</dt>
                  <dd>{session.recruiterCameraOn !== false ? "On" : "Off"}</dd>
                  <dt>Candidate</dt>
                  <dd>{candidateName}</dd>
                  <dt>Status</dt>
                  <dd>{stage === "live" ? "In progress" : stage === "connecting" ? "Connecting" : stage === "closing" ? "Finishing" : "Not started"}</dd>
                  <dt>Time Remaining</dt>
                  <dd>{pad(Math.floor(secondsLeft / 60))}:{pad(secondsLeft % 60)}</dd>
                </dl>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Mobile drawer overlay */}
      {(transcriptOpen || infoOpen) && (
        <div className="drawer-backdrop" onClick={transcriptOpen ? () => setTranscriptOpen(false) : () => setInfoOpen(false)} aria-hidden="true" />
      )}

      {/* Typed fallback for when speech recognition fails */}
      {srFailed && phase === "listening" && !cameraInterrupted && (
        <div className="typed-fallback" role="dialog" aria-label="Type your answer">
          <p>Voice input isn&rsquo;t working, so type your answer instead.</p>
          <div className="typed-row">
            <textarea value={typed} rows={2} placeholder="Type your answer..." disabled={phase !== "listening"} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn btn-primary" disabled={phase !== "listening" || !typed.trim()} onClick={() => submit(typed)}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}