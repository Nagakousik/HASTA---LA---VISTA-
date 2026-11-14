/**
 * turnMachine.js: the candidate-turn endpoint.
 *
 * Speech recognition reports one phrase at a time. The controller accumulates all
 * of those phrases into a single answer and only declares the turn finished after
 * a real silence that is measured from the most recent speech event. It is a
 * plain object rather than React state so a 250ms clock tick can evaluate it
 * without racing a re-render.
 */

import { silenceFor, wordCount } from "./turnTaking.js";

// A safety valve for a candidate who speaks without ever pausing. Long answers
// (30-60s) are completely normal; two minutes of non-stop speech is the point at
// which we stop the turn so the interview can never hang forever.
export const MAX_ANSWER_MS = 120000;

// While recognition is still holding an open (interim) phrase, wait longer before
// deciding the answer is over. Most engines finalise within a second once the
// candidate really stops; this grace period covers the ones that are slower.
export const INTERIM_GRACE_MS = 1500;

export function createTurnController() {
  let turnId = 0;
  let active = false;
  let text = "";
  let lastSpeechAt = 0;
  let firstSpeechAt = 0;
  let lastWasFinal = true;
  let submitted = false;

  return {
    begin() {
      turnId += 1;
      active = true;
      text = "";
      lastSpeechAt = 0;
      firstSpeechAt = 0;
      lastWasFinal = true;
      submitted = false;
      return turnId;
    },

    /** Discard the current partial answer (mute, repeat request, non-response). */
    stop() {
      active = false;
    },

    get turnId() {
      return turnId;
    },
    get active() {
      return active;
    },
    get text() {
      return text;
    },
    get submitted() {
      return submitted;
    },
    get hasSpeech() {
      return firstSpeechAt > 0;
    },

    /**
     * Record a recognition result. Called for interim AND final results, because
     * an interim result is proof the candidate is still talking even though the
     * text is not final yet.
     */
    noteSpeech(nextText, now = Date.now(), isFinal = true) {
      if (!active || submitted) return text;
      const clean = String(nextText || "").trim();
      if (clean) {
        text = clean;
        lastSpeechAt = now;
        lastWasFinal = !!isFinal;
        if (!firstSpeechAt) firstSpeechAt = now;
      }
      return text;
    },

    /**
     * Returns `{ type: "submit", turnId, text }` when the turn is genuinely over.
     * Any later tick after submission returns null, so the next question can only
     * be generated once per answer.
     */
    evaluate({ now = Date.now(), phase, speaking = false, muted = false, interrupted = false, ended = false }) {
      if (!active || submitted || ended) return null;
      if (phase !== "listening" || muted || interrupted || speaking) return null;
      if (!text) return null;

      const quietFor = now - lastSpeechAt;
      // An open interim phrase means the candidate is still mid-sentence. Wait a
      // little longer before deciding the answer is over.
      const required = silenceFor(wordCount(text)) + (lastWasFinal ? 0 : INTERIM_GRACE_MS);
      const runningTooLong = firstSpeechAt > 0 && now - firstSpeechAt >= MAX_ANSWER_MS;
      const bySilence = quietFor >= required;

      if (!bySilence && !runningTooLong) return null;
      return {
        type: "submit",
        turnId,
        text,
        reason: bySilence ? "silence" : "max-length",
      };
    },

    /** Claim the one allowed submission for a turn. Returns false for stale or duplicate calls. */
    markSubmitted(expectedTurnId = turnId) {
      if (expectedTurnId !== turnId || !active || submitted) return false;
      submitted = true;
      active = false;
      return true;
    },
  };
}

/**
 * Decide what to do after the interviewer has finished speaking the current turn.
 *
 * `replyEnd` is intentionally ignored while time remains: question counts,
 * scripted pool exhaustion, and model-generated closing language must never end
 * the interview. Only the deadline may finish it.
 */
export function decideAfterTurn({ timeUp, remainingMs, replyEnd = false }) {
  if (timeUp || remainingMs <= 0) return "finish";
  void replyEnd;
  return "continue";
}

/**
 * Decide what to do the moment the deadline expires.
 *
 * A question being spoken or an answer being given in-progress is allowed to
 * finish. An empty listening phase (candidate never started) closes immediately.
 */
export function decideOnTimeUp({ phase, hasSpeech = false }) {
  if (phase === "thinking" || phase === "speaking") return "wait";
  if (phase === "listening" && hasSpeech) return "wait";
  return "finish";
}
