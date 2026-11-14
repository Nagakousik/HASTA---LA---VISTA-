/**
 * interviewEngine.js: the SCRIPTED brain behind the recruiter.
 *
 * It needs no network: questions are built from the resume, the company, the role,
 * the current state of AI-assisted engineering, and hypothetical situations that show
 * how the candidate thinks. interviewBrain.js wraps this engine and, when a free Groq
 * key is configured, lets a model re-phrase each turn in the recruiter's own words
 * using the last few exchanges. The shape is the same either way:
 *
 *   const engine = createEngine({ session, persona });
 *   const { text, end } = await engine.next({ candidateText, phase, secondsLeft });
 *
 *   candidateText  what the student said, or NO_ANSWER for silence (null on the very first call)
 *   phase          "resume" | "technical" | "wrapup", chosen by the app from the clock
 *   returns        text = what the recruiter says out loud, end = true when the interview is over
 *
 * The room, timer, voice and transcript never change when the AI is on.
 */

export const NO_ANSWER = "[no answer]";

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wordCount = (t) => (t.trim().match(/\S+/g) || []).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TECHS = [
  "React", "Node.js", "Express", "MongoDB", "MySQL", "PostgreSQL", "SQL", "Python", "Java",
  "JavaScript", "TypeScript", "Firebase", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
  "Django", "Flask", "Spring Boot", "Redux", "Next.js", "Vite", "Tailwind", "Socket.io",
  "TensorFlow", "PyTorch", "Pandas", "NumPy", "LangChain", "OpenAI", "Groq", "Git", "CI/CD",
  "Angular", "Vue", "GraphQL", "Redis", "Kafka",
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const BANK = {
  frontend: {
    basics: [
      "Explain the difference between var, let and const, and a bug caused by choosing wrong.",
      "Walk me through what the browser does from receiving HTML to pixels on the screen.",
      "What is event delegation, and when would you avoid it?",
      "How would you stop a React component from re-rendering when it does not need to?",
      "Explain closures using an example from code you actually wrote.",
      "How do you decide what belongs in a component versus a shared hook or utility?",
      "What actually happens to the DOM when a React state update triggers a render?",
    ],
    system: [
      "A page of yours is fast on your laptop and slow on a low-end Android phone. What do you measure first?",
      "How would you make a list of ten thousand rows usable without freezing the tab?",
    ],
    hypothetical: [
      "A dashboard you own is fast in staging and slow for every customer after a release that changed only CSS. Walk me through your first hour.",
      "Product asks for a redesign in two days, which normally takes two weeks. How do you decide what to ship and what to cut?",
      "A designer hands you a mockup that is beautiful on desktop and unusable on a phone. How do you handle that conversation?",
    ],
  },
  backend: {
    basics: [
      "Explain how an HTTP request travels from the browser to your server and back.",
      "What is the difference between SQL and NoSQL, and when would each be the wrong choice?",
      "How do you prevent SQL injection?",
      "What is a database index, and what does adding one cost you?",
      "Explain authentication versus authorization, and how you used each.",
      "What happens to an in-flight request if your server restarts mid-write?",
    ],
    system: [
      "Your API's p99 latency triples after a deploy that changed no application code. What do you check?",
      "How would you design a job queue so that no task is ever processed twice?",
    ],
    hypothetical: [
      "Your service is fine for months, then fails only during a flash sale. Walk me through how you find the limit.",
      "You inherit a codebase where every endpoint has its own copy of the same logic. What is your first week?",
      "A customer reports data loss and you cannot reproduce it. What do you do in the first hour?",
    ],
  },
  data: {
    basics: [
      "Explain the difference between supervised and unsupervised learning.",
      "How do you handle missing data, and what are the risks of each approach?",
      "What is overfitting, and how do you detect it?",
      "How would you find the second highest salary using SQL? Explain the logic.",
      "Explain a p-value to a manager with no technical background.",
      "How do you decide whether a model improvement is real or just noise?",
    ],
    system: [
      "Your model scores well offline and badly in production. What do you compare first?",
      "How would you monitor a model after launch without waiting for labelled data?",
    ],
    hypothetical: [
      "The training data contains a bias you only notice after launch. What do you do, and in what order?",
      "A stakeholder wants a prediction your data cannot support. How do you say no without losing the project?",
      "You have one week and a messy dataset. What do you deliver first?",
    ],
  },
  general: {
    basics: [
      "What is the time complexity of a hash map lookup, and when does it degrade?",
      "Explain the difference between a process and a thread.",
      "How would you detect a cycle in a linked list?",
      "What happens when you type a URL into a browser and press enter?",
      "Explain the difference between stack and heap memory.",
      "How would you debug a bug that only appears on a colleague's machine?",
    ],
    system: [
      "A feature works for one user and fails for another with the same input. What do you compare?",
      "How would you design something that must keep working when one part of it goes down?",
    ],
    hypothetical: [
      "You are given a task with no specification and a deadline this week. What do you do first?",
      "Two senior engineers disagree on the design and both want you to pick a side. How do you handle it?",
      "You find a security bug in code that already shipped. Walk me through the next hour.",
    ],
  },
};

const AI_ERA = (company) => [
  `AI tools can scaffold a feature in minutes. What part of your own work would you still write yourself, and why?`,
  "How would you review code that an AI wrote, when it looks clean and the tests pass?",
  `If an agent completed half of the routine tickets at ${company}, what would you spend the freed time on?`,
  "Which part of software engineering do you think AI will not replace in the next five years, and why?",
  "Tell me about a time you used AI on a task. What did you keep, and what did you correct?",
  "If your team could only keep one habit from pre-AI engineering, what should it be?",
];

const COMPANY = (company) => [
  `What do you understand about what ${company} does, and which part of it would you want to work on?`,
  `Why ${company}, specifically, instead of a bigger brand with a louder name?`,
  `If you joined ${company} next week, what would you want to learn in your first month?`,
  `What would you improve about ${company} from the outside, based on what you have seen?`,
];

const BEHAVIOUR = [
  "Tell me about a deadline you nearly missed. What did you do?",
  "Describe a time your team disagreed on a technical decision. What did you do?",
  "Tell me about a time you changed your mind after seeing evidence.",
  "Describe something you shipped that you were later embarrassed by. What did you learn?",
  "Tell me about a time you had to explain a technical problem to someone non-technical.",
  "When did you last ask for help later than you should have? What happened?",
];

const GROWTH = [
  "What is one skill you know is weak, and what are you doing about it?",
  "How do you decide what to learn next, when everything looks important?",
  "What did you learn in the last three months that changed how you write code?",
];

const STRETCH = [
  "If you had to defend one technical decision you made to a room of sceptical engineers, which would it be?",
  "What is a popular practice in your field that you think is overrated, and why?",
  "Suppose our main product is unavailable for an hour. What should the engineering team do first, and what should they tell customers?",
  "You have to estimate a project you have never done before. How do you give a number you can defend?",
  "What would you do if a teammate's code repeatedly failed review but they were well liked?",
  "If you could remove one layer from the stack you work with, which one, and what breaks?",
  "How would you decide whether to fix a slow piece of code or rewrite it?",
  "What is the difference between something being correct and something being trustworthy?",
];

const BRIDGES = {
  ack: ["Okay.", "Right.", "Understood.", "Got it.", "Fair enough.", "Alright.", "Noted."],
  think: [
    "Let me think about that for a second.",
    "Hmm, let me consider that.",
    "Okay, that is worth unpacking.",
    "Hold on, I want to follow that thread.",
  ],
  press: [
    "Be concrete. What exactly did you do?",
    "Give me one specific example, not the general approach.",
    "I need the detail, not the summary.",
    "Take me to the moment it broke. What did you see?",
  ],
  none: ["Moving on.", "We will leave that there.", "No problem, let us continue.", "That is fine, we can move on."],
};

const short = (line, max = 96) => {
  const t = line.replace(/^[\s\-*\u2022\u25cf\u25aa]+/, "").replace(/\s+/g, " ").trim();
  const tail = new Set("in on at of for with and or to by from used using the a an as that which is are was were into over".split(" "));
  const tidy = (s) => {
    let out = s.replace(/[.;,:"')\]]+$/, "").trim();
    for (let i = 0; i < 3; i++) {
      const words = out.split(" ");
      if (words.length < 3 || !tail.has(words[words.length - 1].toLowerCase())) break;
      words.pop();
      out = words.join(" ");
    }
    return out;
  };
  if (t.length <= max) return tidy(t);
  const cut = t.slice(0, max);
  return tidy(cut.slice(0, cut.lastIndexOf(" ")));
};

function roleBank(role = "") {
  const r = role.toLowerCase();
  if (/full ?stack/.test(r)) return BANK.frontend;
  if (/front|\bui\b|web|react|angular|vue/.test(r)) return BANK.frontend;
  if (/back|server|api|node|platform|infra|devops/.test(r)) return BANK.backend;
  if (/data|analy|\bml\b|machine|\bai\b|scientist/.test(r)) return BANK.data;
  return BANK.general;
}

/** A short, quotable phrase from the answer, so the scripted voice can react to content.
 *  Only names and technologies are echoed: arbitrary two-word slices read like
 *  "You mentioned year computer", which sounds broken out loud. */
export function echoPhrase(text = "") {
  if (!text) return "";
  const tech = TECHS.find((t) => new RegExp(`\\b${esc(t)}(?![\\w])`, "i").test(text));
  if (tech) return tech;

  const skip = /^(i|the|this|that|it|my|we|our|and|but|so|because|when|what|why|how|if|in|on|at|for|with|a|an|to|of|as|is|was|were|are|then|there|they|he|she|you)$/i;
  const words = text.match(/\b[A-Z][A-Za-z0-9.+#-]{2,}\b/g) || [];
  const named = words.find((w) => !skip.test(w));
  return named ? named.replace(/[.,;:]+$/, "") : "";
}

/** Pulls project-like lines, achievements and technologies out of the resume text. */
export function extractFacts(resume = "") {
  const lines = resume
    .split(/\n|(?<=[.;])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 25 && l.length < 260);
  const projectLines = lines.filter((l) =>
    /\b(built|developed|designed|implemented|created|led|launched|deployed|integrated|optimi[sz]ed|migrated|project|dashboard|website|app|application)\b/i.test(l)
  );
  const projects = [...new Set(projectLines.map((l) => short(l)))].slice(0, 4);
  const metrics = [...new Set(
    lines
      .filter((l) => /\b\d+\s?(%|percent|x|ms|s|k|m|users|rows|requests|hours|days)\b/i.test(l))
      .map((l) => short(l))
  )].slice(0, 3);
  const techs = TECHS.filter((t) => new RegExp(`\\b${esc(t)}(?![\\w])`, "i").test(resume))
    .sort((a, b) => resume.indexOf(a) - resume.indexOf(b));
  return { projects, metrics, techs };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((q) => {
    const k = q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function createScriptedEngine({ session, persona, thinkMs }) {
  const facts = extractFacts(session.resume);
  const company = (session.company || "").trim() || "this company";
  const role = (session.role || "").trim() || "this role";
  const bank = roleBank(role);
  const aiQs = AI_ERA(company);

  /* Resume phase: what they wrote, their motivation, and how they work with people.
     Project facts and human questions are interleaved so a normal-length interview
     covers both instead of spending every early turn on one resume bullet. */
  const core = [];
  const [p1, p2, p3] = facts.projects;
  const projectQ = [];
  if (p1) {
    projectQ.push(
      `You wrote: ${p1}. What exactly did you build yourself, and what was your role?`,
      `In "${short(p1, 64)}", what was the hardest bug, and how did you find the root cause?`,
      `If you rebuilt "${short(p1, 64)}" today, what would you do differently?`
    );
  } else {
    projectQ.push(
      "Describe the most complex project you have built. What was your exact contribution?",
      "What went wrong in that project, and how did you fix it?",
      "If you rebuilt it today, what would you do differently?"
    );
  }
  const metricQ = facts.metrics[0] ? `You claim: "${facts.metrics[0]}". How did you measure that, and what was the baseline?` : "";
  core.push(
    projectQ[0],
    metricQ,
    projectQ[1],
    projectQ[2],
    facts.techs[0] ? `Your resume lists ${facts.techs[0]}. Explain how it works under the hood, not just how you used it.` : "",
    facts.techs[1] ? `You list ${facts.techs[0]} and ${facts.techs[1]}. Which would you trust in production, and why?` : "",
    p2 ? `You also wrote: ${p2}. What would you change about it today?` : "",
    p3 ? `Tell me about "${short(p3, 64)}". What was your part in it?` : ""
  );

  /* Company questions, growth and behaviour are interleaved with resume facts so a
     fifteen-minute interview covers all of them, not just one resume bullet. */
  const pools = [COMPANY(company), GROWTH, BEHAVIOUR];
  const social = [];
  for (let i = 0; i < Math.max(...pools.map((p) => p.length)); i++) {
    for (const pool of pools) if (pool[i]) social.push(pool[i]);
  }
  const resumeQ = [];
  const coreQ = core.filter(Boolean);
  for (let i = 0; i < Math.max(coreQ.length, social.length); i++) {
    if (coreQ[i]) resumeQ.push(coreQ[i]);
    if (social[i]) resumeQ.push(social[i]);
  }

  /* Technical phase: fundamentals, then thinking under uncertainty, then the AI era. */
  const technicalQ = dedupe([
    bank.basics[0],
    bank.hypothetical[0],
    aiQs[0],
    bank.basics[1],
    aiQs[1],
    bank.hypothetical[1],
    bank.system[0],
    aiQs[2],
    bank.basics[2],
    bank.hypothetical[2],
    aiQs[3],
    bank.system[1],
    bank.basics[3],
    aiQs[4],
    ...BEHAVIOUR.slice(2),
    ...GROWTH.slice(1),
  ].filter(Boolean));

  const stretchQ = dedupe([...aiQs.slice(4), ...COMPANY(company), ...STRETCH, ...bank.hypothetical, ...bank.basics]);

  let turn = 0;
  let followedUp = false;
  let lastKind = "open";
  let wrapStep = 0;
  let lastBridge = "";
  const used = new Set();

  const pickBridge = (kind) => {
    const pool = BRIDGES[kind].filter((b) => b !== lastBridge);
    const b = rand(pool.length ? pool : BRIDGES[kind]);
    lastBridge = b;
    return b;
  };

  const take = (list) => {
    while (list.length) {
      const q = list.shift();
      const k = q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      if (!used.has(k)) {
        used.add(k);
        return q;
      }
    }
    return null;
  };

  const pick = (phase) => {
    const fromMainPools = () => {
      // Keep company / behaviour / growth turns in the mix during the technical
      // phase, so a shorter interview never spends every turn on fundamentals.
      if (phase === "technical" && turn % 4 === 0) {
        const r = take(resumeQ);
        if (r) return r;
      }
      return take(technicalQ) || take(resumeQ) || take(stretchQ);
    };

    if (phase === "wrapup") {
      if (wrapStep === 0) { wrapStep = 1; return `One more question. Why should ${company} hire you over other candidates for this ${role} role?`; }
      if (wrapStep === 1) { wrapStep = 2; return "Before we move on, what questions do you have for us?"; }
      // Time remains after the usual closing questions: keep the conversation
      // going with substantive questions instead of ending early.
      return take(stretchQ) || fromMainPools();
    }
    if (phase === "resume") {
      const q = take(resumeQ);
      if (q) return q;
    }
    const q = fromMainPools();
    if (q) return q;

    // Every pool is exhausted but the clock still has time. Reuse the richest
    // material rather than declaring the interview over.
    used.clear();
    return take(stretchQ) || take(technicalQ) || take(resumeQ)
      || "Tell me about a recent technical decision you made. What alternatives did you consider?";
  };

  /** A short, human reaction before the next question: acknowledgement, thinking, or a nudge. */
  const bridge = (kind, candidateText) => {
    if (kind === "none") return pickBridge("none");
    const echo = kind === "ack" && Math.random() < 0.45 ? echoPhrase(candidateText) : "";
    const lead = pickBridge(kind);
    return echo ? `${lead} You mentioned ${echo}.` : lead;
  };

  return {
    async next({ candidateText = "", phase = "resume" } = {}) {
      await sleep(thinkMs ?? 450 + Math.random() * 450);

      if (turn === 0) {
        turn++;
        const hook = facts.projects[0] ? ` We will start with "${short(facts.projects[0], 52)}".` : "";
        return {
          text: `Good day. I'm ${persona.name}, ${persona.title} at ${company}. We have ${session.minutes} minutes for this ${role} interview.${hook} To begin, who are you, and which project are you proudest of?`,
        };
      }

      const noAnswer = !String(candidateText || "").trim() || candidateText === NO_ANSWER;
      const isIntro = turn === 1;
      turn++;

      const answerText = String(candidateText || "");
      if (!noAnswer && !isIntro && !followedUp && lastKind === "main" && wordCount(answerText) < 8) {
        followedUp = true;
        lastKind = "followup";
        const echo = echoPhrase(answerText);
        return { text: echo ? `${pickBridge("ack")} You mentioned ${echo}. ${pickBridge("press")}` : `${pickBridge("ack")} ${pickBridge("press")}` };
      }

      // Occasionally follow a named technology or project from a longer answer,
      // so the fallback interviewer reacts to content rather than marching
      // through a question list.
      const echo = noAnswer || isIntro ? "" : echoPhrase(answerText);
      if (!noAnswer && !isIntro && !followedUp && lastKind === "main" && echo && wordCount(answerText) >= 8 && Math.random() < 0.35) {
        followedUp = true;
        lastKind = "followup";
        return { text: `${pickBridge("ack")} You mentioned ${echo}. What was the hardest part of working with it?` };
      }
      followedUp = false;

      const q = pick(phase) || "Tell me about a recent technical decision you made, and why you made it.";
      lastKind = "main";
      const kind = noAnswer ? "none" : Math.random() < 0.22 ? "think" : "ack";
      return { text: `${bridge(kind, answerText)} ${q}`.replace(/\s+/g, " ").trim() };
    },
  };
}

// Scripted engine only, with no network at all. The room uses interviewBrain.js,
// which wraps this and lets an optional free-tier Groq key re-phrase each question.
export const createEngine = createScriptedEngine;
