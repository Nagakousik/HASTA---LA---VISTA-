import test from "node:test";
import assert from "node:assert/strict";

import {
  createDeadline,
  remainingMs,
  secondsLeft,
  hasExpired,
  elapsedFraction,
  MINUTE_MS,
} from "../src/utils/interviewClock.js";
import { decideAfterTurn, decideOnTimeUp } from "../src/utils/turnMachine.js";
import {
  createCompletionGate,
  buildCompletedSession,
  resultsPath,
} from "../src/utils/completion.js";
import { createScriptedEngine } from "../src/services/interviewEngine.js";

const START = 1_700_000_000_000;

test("a five-minute interview initialises to exactly five minutes", () => {
  const clock = createDeadline(START, 5);

  assert.equal(clock.totalMs, 5 * MINUTE_MS);
  assert.equal(clock.deadline, START + 5 * MINUTE_MS);
  assert.equal(secondsLeft(clock.deadline, START), 300);
  assert.equal(hasExpired(clock.deadline, START), false);
});

test("countdown values come from the deadline, not accumulated ticks", () => {
  const clock = createDeadline(START, 5);

  assert.equal(remainingMs(clock.deadline, START + 123_456), 300_000 - 123_456);
  assert.equal(secondsLeft(clock.deadline, START + 123_456), Math.ceil((300_000 - 123_456) / 1000));
  assert.equal(hasExpired(clock.deadline, START + 300_000), true);
  assert.equal(remainingMs(clock.deadline, START + 999_999), 0);
  assert.equal(elapsedFraction(clock.deadline, clock.totalMs, START + 150_000), 0.5);
});

test("activity continues while meaningful time remains", () => {
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 240_000, replyEnd: false }), "continue");
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 90_000, replyEnd: false }), "continue");
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 1, replyEnd: false }), "continue");
});

test("question counts and reply.end can never finish the interview early", () => {
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 240_000, replyEnd: true }), "continue");
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 60_000, replyEnd: true }), "continue");
});

test("AI closing language is ignored until the deadline", () => {
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 180_000, replyEnd: true }), "continue");
  assert.equal(decideAfterTurn({ timeUp: false, remainingMs: 0, replyEnd: true }), "finish");
  assert.equal(decideAfterTurn({ timeUp: true, remainingMs: 180_000, replyEnd: true }), "finish");
});

test("deadline expiry while the AI is speaking waits for the question to finish", () => {
  assert.equal(decideOnTimeUp({ phase: "speaking" }), "wait");
});

test("deadline expiry while Groq is generating waits for the response", () => {
  assert.equal(decideOnTimeUp({ phase: "thinking" }), "wait");
});

test("deadline expiry while the candidate answers or thinks waits for the turn", () => {
  assert.equal(decideOnTimeUp({ phase: "listening", hasSpeech: true }), "wait");
  assert.equal(decideOnTimeUp({ phase: "listening", hasSpeech: false }), "finish");
});

test("an active turn closes gracefully immediately after the deadline", () => {
  assert.equal(decideOnTimeUp({ phase: "listening", hasSpeech: true }), "wait");
  assert.equal(decideAfterTurn({ timeUp: true, remainingMs: 0 }), "finish");
});

test("completion is requested exactly once even with duplicate callbacks", () => {
  const gate = createCompletionGate();
  const closingLines = [];
  const complete = (reason) => {
    if (!gate.request()) return;
    closingLines.push(reason);
  };

  complete("time");
  complete("time");
  complete("left");

  assert.equal(gate.done, true);
  assert.deepEqual(closingLines, ["time"]);
});

test("the completed session persists the full transcript and completion metadata", () => {
  const turns = [
    { role: "ai", text: "Tell me about your project." },
    { role: "user", text: "I built a React dashboard." },
    { role: "ai", text: "We are at the end of our scheduled time." },
  ];
  const payload = buildCompletedSession({
    turns,
    reason: "time",
    endedAt: START + 300_000,
    fallbackLine: "closing",
  });

  assert.equal(payload.status, "done");
  assert.equal(payload.endReason, "time");
  assert.equal(payload.endedAt, START + 300_000);
  assert.deepEqual(payload.transcript, turns);
});

test("an empty transcript still persists a valid completed session", () => {
  const payload = buildCompletedSession({ turns: [], reason: "left", fallbackLine: "Interview ended." });

  assert.equal(payload.status, "done");
  assert.equal(payload.transcript.length, 1);
  assert.equal(payload.transcript[0].role, "ai");
});

test("results navigation points at the completed session", () => {
  assert.equal(resultsPath("abc123"), "/app/results/abc123");
});

test("the scripted fallback never concludes while time remains", async () => {
  const engine = createScriptedEngine({
    session: {
      company: "Acme",
      role: "Frontend Engineer",
      minutes: 5,
      resume: "Built a React dashboard with Firebase. Reduced page load time by 40%.",
    },
    persona: { name: "Riya Sharma", title: "Engineering Manager" },
    thinkMs: 0,
  });

  const closing = /\b(thank you for your time|that concludes|we(?:'re| are) out of time|let(?:'s| us) wrap|we(?:'ll| will) be in touch)\b/i;

  for (let turn = 0; turn < 40; turn += 1) {
    const reply = await engine.next({
      candidateText: turn === 0 ? "" : "I built a React dashboard and improved load time by 40 percent.",
      phase: "wrapup",
      secondsLeft: 10,
    });

    assert.ok(reply?.text?.trim().length > 0, `turn ${turn} returned text`);
    assert.equal(reply.end, undefined, `turn ${turn} must not end the interview`);
    assert.ok(!closing.test(reply.text), `turn ${turn} must not use closing language: ${reply.text}`);
  }
});
