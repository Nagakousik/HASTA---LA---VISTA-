/**
 * voices.js: picks a male or female browser voice and speaks with it.
 * Browsers don't say which voice is male or female, so we match on voice names
 * and fall back to shifting the pitch if no match is found.
 */

const FEMALE = /\b(female|woman|zira|heera|neerja|aria|jenny|samantha|susan|hazel|libby|sonia|natasha|swara|veena|karen|tessa|fiona|moira|victoria|kalpana|aditi|raveena|priya|lekha|emma|ava|michelle|amy|joanna|salli|google us english)\b/i;
const MALE = /\b(male|ravi|prabhat|david|mark|george|guy|ryan|thomas|alex|daniel|fred|james|rishi|christopher|eric|brian|liam|matthew|hemant|rohan|aaron|arthur|justin|kevin)\b/i;

export function classify(name = "") {
  if (FEMALE.test(name)) return "female";
  if (MALE.test(name)) return "male";
  return "unknown";
}

function score(v, gender) {
  const lang = (v.lang || "").toLowerCase().replace("_", "-");
  if (!lang.startsWith("en")) return -1;
  let s = lang === "en-in" ? 30 : lang === "en-gb" ? 20 : lang === "en-us" ? 15 : 10;
  if (/natural|online/i.test(v.name)) s += 25; // Edge's natural voices sound best
  const g = classify(v.name);
  if (g === gender) s += 100;
  else if (g !== "unknown") s -= 100;
  return s;
}

/** Returns { voice, matched }. matched = the voice name clearly fits the gender. */
export function pickVoice(voices, gender) {
  const ranked = voices.map((v) => ({ v, s: score(v, gender) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  const best = ranked[0]?.v || null;
  return { voice: best, matched: !!best && classify(best.name) === gender };
}

/** Firm, measured delivery. If the voice isn't a clear match, shift the pitch to help. */
export const voiceSettings = (gender, matched) =>
  gender === "male" ? { pitch: matched ? 0.9 : 0.75, rate: 0.95 } : { pitch: matched ? 1.0 : 1.15, rate: 0.95 };

export function loadVoices(timeout = 1500) {
  return new Promise((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return resolve([]);
    const have = synth.getVoices();
    if (have.length) return resolve(have);
    const done = () => { synth.removeEventListener("voiceschanged", done); clearTimeout(t); resolve(synth.getVoices()); };
    const t = setTimeout(done, timeout);
    synth.addEventListener("voiceschanged", done);
  });
}

/** Speaks the text and resolves when finished (or cancelled, or after a safety timeout). */
let speakToken = 0;

/**
 * Shared speaking signal for the recruiter avatar: `speaking` while the recruiter
 * is talking, `pulse` = timestamp of the last word boundary, `beat` = a short
 * emphasis marker, `question` = the line ends with a question, and `mic` = the
 * candidate's current microphone level.
 */
export const speechSignal = { speaking: false, pulse: 0, since: 0, mic: 0, beat: 0, question: false };

export function speak(text, { voice, pitch = 1, rate = 0.95 } = {}) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve();
    synth.cancel();
    const token = ++speakToken;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "en-IN";
    u.pitch = pitch;
    u.rate = rate;
    speechSignal.question = /\?\s*$/.test(text); // shapes the eyebrow and head tilt
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      if (token === speakToken) { speechSignal.speaking = false; speechSignal.question = false; }
      resolve();
    };
    const guard = setTimeout(() => { synth.cancel(); finish(); }, 4000 + text.length * 110);
    u.onstart = () => {
      if (token !== speakToken) return;
      speechSignal.speaking = true;
      speechSignal.since = performance.now();
      speechSignal.pulse = performance.now();
      speechSignal.beat = performance.now();
    };
    u.onboundary = () => {
      if (token !== speakToken) return;
      speechSignal.pulse = performance.now();
      speechSignal.beat = performance.now();
    };
    u.onend = finish;
    u.onerror = finish;
    speechSignal.speaking = true;
    speechSignal.since = performance.now();
    speechSignal.pulse = performance.now();
    speechSignal.beat = performance.now();
    synth.speak(u);
  });
}

export const stopSpeaking = () => {
  if (typeof window === "undefined") return;
  speechSignal.speaking = false;
  window.speechSynthesis?.cancel();
};