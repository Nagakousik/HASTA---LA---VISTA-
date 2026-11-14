/**
 * interviewBrain.js: the engine the room actually uses.
 *
 * Groq is now the PRIMARY conversational engine. It receives full context and
 * generates the next appropriate question: follow-up, clarification, or new
 * topic. It never ends the interview; the application owns the deadline. The
 * scripted engine is a CLEAR FALLBACK used only when Groq is unavailable or
 * fails. No silent mixing of scripted questions.
 */

import { createScriptedEngine } from "./interviewEngine";
import { createGroqPolisher } from "./groqBrain";

export { NO_ANSWER } from "./interviewEngine";

const STYLES = [
  "warm and encouraging, but still probing",
  "curious, as if you genuinely want the detail",
  "direct and brisk, like a busy hiring manager",
  "politely sceptical, testing whether the claim holds",
  "thoughtful, thinking out loud for a moment before asking",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Only explicit closing phrases; loose words like "finish" appear in normal questions.
const CONCLUSION_PATTERN = /\b(thank you for your time|that(?:'s| is) all|that concludes|we(?:'re| are) out of time|let(?:'s| us) wrap|we(?:'ll| will) (?:wrap|have to stop))\b/i;

export function createEngine({ session, persona, thinkMs }) {
  const groq = createGroqPolisher({ session, persona });
  const scripted = createScriptedEngine({
    session,
    persona,
    thinkMs: thinkMs ?? 450,
  });

  const asked = [];
  const recent = [];
  let turn = 0;
  let lastStyle = "";
  let groqFailed = false;

  if (import.meta.env?.DEV) {
    console.info(
      `[recruiter] ${groq.enabled ? `Groq primary (${groq.model})` : "Groq unavailable, using scripted fallback"}`
    );
  }

  const nextStyle = () => {
    const pool = STYLES.filter((s) => s !== lastStyle);
    lastStyle = pick(pool.length ? pool : STYLES);
    return lastStyle;
  };

  const remember = (role, text) => {
    if (!text) return;
    recent.push({ role, text: String(text).slice(0, 240) });
    if (recent.length > 6) recent.shift();
  };

  const buildGroqContext = (ctx = {}) => {
    const totalMs = Math.max(1, session.minutes * 60000);
    // secondsLeft = 0 is a real value near the deadline; it must not fall back
    // to "the interview just started".
    const hasClock = Number.isFinite(ctx.secondsLeft);
    const leftMs = Math.max(0, hasClock ? ctx.secondsLeft * 1000 : totalMs);
    const frac = 1 - leftMs / totalMs;
    const phase = frac < 0.4 ? "resume" : frac < 0.82 ? "technical" : "wrapup";

    return {
      phase,
      secondsLeft: leftMs / 1000,
      totalMinutes: session.minutes,
      frac,
    };
  };

  const scriptedFallback = async (ctx = {}) => {
    if (import.meta.env?.DEV) {
      console.info("[recruiter] Using scripted fallback");
    }
    const context = buildGroqContext(ctx);
    const base = await scripted.next({ ...ctx, phase: context.phase });
    if (ctx.candidateText) remember("user", ctx.candidateText);
    if (base?.text) remember("ai", base.text);
    return base;
  };

  return {
    ai: groq.enabled,
    async next(ctx = {}) {
      const context = buildGroqContext(ctx);
      const isFirst = turn === 0;
      turn++;

      if (ctx.candidateText) remember("user", ctx.candidateText);

      if (isFirst) {
        const base = await scripted.next({});
        if (base?.text) remember("ai", base.text);
        return base;
      }

      if (!groq.enabled || groqFailed) {
        return scriptedFallback(ctx);
      }

      try {
        const style = nextStyle();
        const polished = await groq.polish({
          base: "",
          candidateText: ctx.candidateText || "",
          phase: context.phase,
          asked,
          recent,
          style,
          session,
          persona,
          timeRemaining: context.secondsLeft,
          totalMinutes: context.totalMinutes,
        });

        if (!polished) {
          return scriptedFallback(ctx);
        }

        const line = polished.text;
        const norm = line.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
        if (asked.some((q) => q.norm === norm)) {
          return scriptedFallback(ctx);
        }

        // The application owns the deadline. A model-generated closing line must
        // never end the interview while scheduled time remains, so discard it and
        // ask the scripted engine for a real question instead.
        const isConclusion = polished.conclude || CONCLUSION_PATTERN.test(line);
        if (isConclusion) {
          if (import.meta.env?.DEV) {
            console.info("[recruiter] Ignoring a premature conclusion; continuing the interview");
          }
          return scriptedFallback(ctx);
        }

        asked.push({ text: line, norm });
        if (asked.length > 8) asked.shift();
        remember("ai", line);

        return { text: line, end: false };
      } catch (err) {
        if (import.meta.env?.DEV) {
          console.warn("[recruiter] Groq error, falling back:", err.message);
        }
        groqFailed = true;
        return scriptedFallback(ctx);
      }
    },
  };
}