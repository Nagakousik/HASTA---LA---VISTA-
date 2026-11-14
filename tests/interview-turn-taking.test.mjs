import test from "node:test";
import assert from "node:assert/strict";

import {
  createTurnController,
  MAX_ANSWER_MS,
} from "../src/utils/turnMachine.js";
import {
  silenceFor,
  wordCount,
  SILENCE_MIN_MS,
  SILENCE_MAX_MS,
} from "../src/utils/turnTaking.js";

const START = 1_700_000_000_000;
const at = (ms) => START + ms;

function makeTurn() {
  const controller = createTurnController();
  controller.begin();
  return controller;
}

function say(controller, text, ms, isFinal = true) {
  return controller.noteSpeech(text, at(ms), isFinal);
}

function listening(controller, ms, overrides = {}) {
  return controller.evaluate({
    now: at(ms),
    phase: "listening",
    ...overrides,
  });
}

test("adaptive silence stays inside sensible minimum and maximum bounds", () => {
  assert.equal(silenceFor(0), SILENCE_MIN_MS);
  assert.equal(silenceFor(1), SILENCE_MIN_MS + 50);
  assert.equal(silenceFor(30), 6500);
  assert.equal(silenceFor(10_000), SILENCE_MAX_MS);
  assert.ok(silenceFor(30) > 1500, "the old 1.5s threshold must be gone");
});

test("a short answer waits for the full minimum silence and submits exactly once", () => {
  const controller = makeTurn();
  say(controller, "Yes, I have.", 1000);

  assert.equal(listening(controller, 1000 + silenceFor(wordCount(controller.text)) - 1), null);
  const action = listening(controller, 1000 + silenceFor(wordCount(controller.text)));

  assert.equal(action?.type, "submit");
  assert.equal(action.text, "Yes, I have.");
  assert.equal(controller.markSubmitted(action.turnId), true);

  // Repeated ticks and duplicate callbacks must not submit twice.
  assert.equal(listening(controller, 20_000), null);
  assert.equal(controller.markSubmitted(action.turnId), false);
});

test("a 45-second answer built from many recognition events is not cut short", () => {
  const controller = makeTurn();
  let transcript = "";

  for (let second = 1; second <= 45; second += 1) {
    transcript = `${transcript} sentence${second}`.trim();
    say(controller, transcript, second * 1000, true);
    // Every one-second gap between events is far shorter than the endpoint wait.
    assert.equal(listening(controller, second * 1000 + 1000), null);
  }

  const required = silenceFor(wordCount(transcript));
  assert.ok(required >= SILENCE_MIN_MS && required <= SILENCE_MAX_MS);
  assert.equal(listening(controller, 45_000 + required - 1), null);

  const action = listening(controller, 45_000 + required);
  assert.equal(action?.type, "submit");
  assert.equal(action.text, transcript);
  assert.equal(controller.markSubmitted(action.turnId), true);
});

test("natural 1-2 second pauses between sentences keep one answer open", () => {
  const controller = makeTurn();

  say(controller, "I built the front end in React.", 1000);
  assert.equal(listening(controller, 2500), null); // 1.5s pause

  say(controller, "I built the front end in React. It talked to a Firebase backend.", 3200);
  assert.equal(listening(controller, 5000), null); // 1.8s pause

  say(controller, "I built the front end in React. It talked to a Firebase backend. The hard part was live updates.", 6200);
  const action = listening(controller, 6200 + silenceFor(wordCount(controller.text)));

  assert.equal(action?.type, "submit");
  assert.match(action.text, /live updates/);
});

test("a longer thinking pause followed by continued speech stays in the same turn", () => {
  const controller = makeTurn();

  say(controller, "Let me think about that.", 1000);
  // 4.5 seconds of silence: deliberately longer than the old 1.5s submission.
  assert.equal(listening(controller, 5500), null);

  say(controller, "Let me think about that. I would start by measuring the bottleneck.", 6000);
  assert.equal(listening(controller, 6000 + SILENCE_MIN_MS - 1), null);

  const action = listening(controller, 6000 + silenceFor(wordCount(controller.text)));
  assert.equal(action?.type, "submit");
  assert.match(action.text, /measuring the bottleneck/);
});

test("interim results keep the turn open; a final result completes it", () => {
  const controller = makeTurn();

  say(controller, "I worked on", 1000, false);
  // The open interim phrase adds a grace period on top of the normal wait.
  assert.equal(listening(controller, 1000 + SILENCE_MIN_MS), null);

  say(controller, "I worked on a React", 2000, false);
  assert.equal(listening(controller, 2000 + silenceFor(4)), null);

  say(controller, "I worked on a React dashboard", 3000, true);
  const required = silenceFor(wordCount(controller.text));
  assert.equal(listening(controller, 3000 + required - 1), null);

  const action = listening(controller, 3000 + required);
  assert.equal(action?.type, "submit");
  assert.match(action.text, /dashboard/);
});

test("recognition stopping and restarting never submits on its own", () => {
  const controller = makeTurn();

  say(controller, "The first part of my answer", 1000, true);
  // A three-second gap while the recognizer restarts is not an endpoint.
  assert.equal(listening(controller, 4000), null);

  say(controller, "The first part of my answer, and the second part", 4500, true);
  assert.equal(listening(controller, 6000), null);

  const action = listening(controller, 4500 + silenceFor(wordCount(controller.text)));
  assert.equal(action?.type, "submit");
  assert.match(action.text, /second part/);
});

test("temporary microphone, mute and camera interruptions block submission", () => {
  const controller = makeTurn();
  say(controller, "My answer is ready", 1000, true);

  assert.equal(listening(controller, 9000, { interrupted: true }), null);
  assert.equal(listening(controller, 9000, { muted: true }), null);
  assert.equal(listening(controller, 9000, { ended: true }), null);

  const action = listening(controller, 9000);
  assert.equal(action?.type, "submit");
});

test("stale ticks from a previous turn cannot claim the current answer", () => {
  const controller = makeTurn();
  say(controller, "One answer", 1000);
  const first = listening(controller, 1000 + silenceFor(2));
  assert.equal(first?.type, "submit");
  assert.equal(controller.markSubmitted(first.turnId), true);

  const staleTurnId = first.turnId;
  controller.begin();
  say(controller, "A new answer", 20_000);

  assert.equal(controller.markSubmitted(staleTurnId), false);
  assert.equal(controller.markSubmitted(controller.turnId), true);
});

test("no submission happens while the AI is speaking or while thinking", () => {
  const controller = makeTurn();
  say(controller, "A complete answer", 1000);

  assert.equal(listening(controller, 20_000, { speaking: true }), null);
  assert.equal(controller.evaluate({ now: at(20_000), phase: "thinking" }), null);
  assert.equal(controller.evaluate({ now: at(20_000), phase: "speaking" }), null);
});

test("speech arriving after submission cannot start a second answer", () => {
  const controller = makeTurn();
  say(controller, "Answer", 1000);
  const action = listening(controller, 1000 + silenceFor(wordCount("Answer")));
  assert.equal(controller.markSubmitted(action.turnId), true);

  assert.equal(controller.noteSpeech("late recognition echo", 20_000), "Answer");
  assert.equal(listening(controller, 30_000), null);
  assert.equal(controller.hasSpeech, true);
});

test("a candidate who never pauses is eventually endpointed", () => {
  const controller = makeTurn();

  for (let ms = 1000; ms <= 1000 + MAX_ANSWER_MS + 1000; ms += 1000) {
    say(controller, `word ${ms}`, ms, false);
  }

  const action = listening(controller, 1000 + MAX_ANSWER_MS + 10);
  assert.equal(action?.type, "submit");
  assert.equal(action.reason, "max-length");
});
