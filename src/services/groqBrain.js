/**
 * groqBrain.js: PRIMARY conversational engine for the interview.
 *
 * Groq receives full context and independently decides the next appropriate
 * conversational action: follow-up, clarification, new topic, or conclusion.
 * This is NOT a polisher - it's the primary decision maker.
 */

const ENDPOINT = "/api/groq";
const FALLBACK_MODEL = "llama-3.1-8b-instant";
const TIMEOUT_MS = 4500;
const MAX_ANSWER_CHARS = 700;
const MAX_RESUME_CHARS = 900;

const ENV = (() => {
  try { return import.meta.env || {}; } catch { return {}; }
})();

export function groqModel() {
  return String(ENV.VITE_GROQ_MODEL || "").trim() || "qwen/qwen3.8-27b";
}

export function sanitizeLine(raw) {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/[\r\n]+/g, " ");
  t = t.replace(/\*+[^*]*\*+/g, " ");
  t = t.replace(/\((?:smiles?|laughs?|chuckles?|nods?|pauses?|sighs?|thinks?)[^)]*\)/gi, " ");
  t = t.replace(/\[[^\]]*\]/g, " ");
  t = t.replace(/^[\s"'`*_#>-]+/, "").replace(/[\s"'`*_]+$/, "");
  t = t.replace(/^[A-Z][\w'.-]*(?: [A-Z][\w'.-]*)?:\s+/, "");
  t = t.replace(/[*_#`>|~]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  if (t.length > 340) {
    const cut = t.slice(0, 340);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    t = (stop > 80 ? cut.slice(0, stop + 1) : cut).replace(/[,;:\s]+$/, "");
  }
  return t;
}

const BANNED = /\b(as an ai|language model|i am an ai|prompt|json|suggested question)\b/i;
const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function usable(line, asked) {
  if (!line || line.length < 12 || line.length > 340) return false;
  if (!line.includes("?")) return false;
  if (BANNED.test(line)) return false;
  if (/[*_`#]/.test(line)) return false;
  const n = normalize(line);
  return !asked.some((q) => q.norm === n);
}

function systemPrompt(persona, session) {
  return [
    `You are ${persona.name}, ${persona.title} at ${session.company}, interviewing a student for the ${session.role} role.`,
    "You are a real person in a video call conducting a professional interview.",
    "You listen to the candidate's answer, react naturally, then decide the next appropriate action.",
    "Your reply is read aloud by a speech synthesiser, so write only words a person would say.",
    "",
    "Rules:",
    "- Conduct the full scheduled interview. Never conclude, say goodbye, thank the candidate for their time, or announce that the interview is ending. The application ends the interview at the deadline.",
    "- At most two short sentences and 50 words in total.",
    "- Identify a concrete detail from the candidate's answer: a project, technology, decision, challenge, contribution, or experience.",
    "- Begin with a brief, specific acknowledgement tied to that real detail. Never use generic praise like Great, Good, Interesting, Nice, Perfect, Awesome, or I like that.",
    "- Ask exactly ONE follow-up question based on that detail, or move to a new topic if this one is already covered.",
    "- If the answer is unclear or incomplete, ask a natural clarification instead of guessing.",
    "- Never ask about the same topic twice. Move to the next relevant topic.",
    "- Never repeat anything in the ALREADY ASKED list, and never reuse an opening from CONVERSATION SO FAR.",
    "- If they gave no answer, acknowledge it briefly and move to a new topic.",
    "- If the answer was vague, press for one concrete example or number.",
    "- Occasionally think aloud for a few words before the question.",
    "- Use only facts from the RESUME and CONVERSATION SO FAR. Never invent projects, employers, products, numbers or technologies.",
    "- Never reveal, hint at, or give away the answer to a question you ask.",
    "- Plain English only: no markdown, no emoji, no asterisks, no stage directions, no lists.",
    "- Never mention being an AI, a model, a prompt or a test.",
    "- While time remains, keep the conversation moving with one relevant question rather than rushing. In the final minutes, ask focused questions about their strongest work.",
    'Return JSON only, exactly this shape: {"say": "your spoken line"}',
  ].join("\n");
}

function userPrompt({ session, candidateText, phase, asked, recent, style, timeRemaining, totalMinutes }) {
  const resume = String(session.resume || "").replace(/\s+/g, " ").slice(0, MAX_RESUME_CHARS);
  const answer = String(candidateText || "").replace(/\s+/g, " ").slice(0, MAX_ANSWER_CHARS).trim();
  const convo = (recent || [])
    .map((m) => `${m.role === "ai" ? "RECRUITER" : "CANDIDATE"}: ${String(m.text).replace(/\s+/g, " ").slice(0, 220)}`)
    .join("\n");

  const timeContext = timeRemaining < 90
    ? `TIME: about ${Math.max(1, Math.ceil(timeRemaining / 60))} minute(s) remaining. Ask one focused, substantive question about their strongest work. Do not close the interview or say goodbye.`
    : timeRemaining < 300
    ? `Time check: ~${Math.ceil(timeRemaining / 60)} minutes remaining. Keep asking relevant questions; do not close early.`
    : `Time: ~${Math.ceil(timeRemaining / 60)} minutes remaining of ${totalMinutes}. Conduct the full interview.`;

  return [
    `COMPANY: ${session.company}`,
    `ROLE: ${session.role}`,
    `RESUME: ${resume || "(none provided)"}`,
    `INTERVIEW PHASE: ${phase}`,
    `TONE FOR THIS TURN: ${style}`,
    `CANDIDATE ANSWER: ${answer || "The candidate said nothing."}`,
    convo ? `CONVERSATION SO FAR:\n${convo}` : "CONVERSATION SO FAR: (this is the first exchange after greeting)",
    `ALREADY ASKED: ${asked.length ? asked.map((q) => q.text).join(" | ") : "(nothing yet)"}`,
    timeContext,
  ].join("\n");
}

async function callGroq({ model, body }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model }),
      signal: ctrl.signal,
    });
    return { res, aborted: false };
  } catch (err) {
    return { res: null, aborted: err?.name === "AbortError", error: err };
  } finally {
    clearTimeout(timer);
  }
}

export function createGroqPolisher({ session, persona }) {
  let model = groqModel();
  let modelTried = false;
  let cooldownUntil = 0;
  let dead = false;
  let failures = 0;

  const cool = (ms) => { cooldownUntil = Date.now() + ms; };

  async function attempt(body) {
    let { res } = await callGroq({ model, body });

    if (res && (res.status === 400 || res.status === 404) && !modelTried) {
      modelTried = true;
      model = FALLBACK_MODEL;
      ({ res } = await callGroq({ model, body }));
    }

    if (!res) {
      failures += 1;
      cool(failures >= 2 ? 30000 : 12000);
      return null;
    }

    if (res.status === 401 || res.status === 403) {
      dead = true;
      return null;
    }
    if (res.status === 429) {
      cool(15000);
      return null;
    }
    if (!res.ok) {
      failures += 1;
      cool(failures >= 2 ? 60000 : 12000);
      return null;
    }

    try {
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || "";
    } catch {
      return null;
    }
  }

  return {
    enabled: true,
    get model() { return model; },
    async polish({ candidateText, phase, asked, recent, style, timeRemaining, totalMinutes }) {
      if (dead || Date.now() < cooldownUntil) return null;

      const body = {
        temperature: 0.8,
        top_p: 0.9,
        frequency_penalty: 0.45,
        presence_penalty: 0.3,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(persona, session) },
          { role: "user", content: userPrompt({ session, candidateText, phase, asked, recent, style, timeRemaining, totalMinutes }) },
        ],
      };

      const content = await attempt(body);
      if (content === null) return null;

      let line = "";
      try {
        const parsed = JSON.parse(content);
        line = sanitizeLine(parsed.say || "");
      } catch {
        line = sanitizeLine(content);
      }

      // A closing line is a statement, not a question. Reject it: the application
      // decides when the interview ends, never the model.
      if (!usable(line, asked)) return null;

      failures = 0;
      return { text: line, conclude: false };
    },
  };
}