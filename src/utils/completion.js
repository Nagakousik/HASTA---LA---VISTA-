/**
 * completion.js: the one-way door at the end of an interview.
 *
 * The gate makes `finish()` idempotent no matter how many timers, async replies,
 * or UI actions race to close the room. The payload builder keeps the persisted
 * session shape in one place so the deadline path and the manual path cannot
 * drift apart.
 */

export function createCompletionGate() {
  let done = false;
  return {
    get done() {
      return done;
    },
    /** true on the first request only; false for every duplicate or late caller. */
    request() {
      if (done) return false;
      done = true;
      return true;
    },
  };
}

export function buildCompletedSession({ turns = [], reason, endedAt = Date.now(), fallbackLine = "" }) {
  const transcript = turns.length
    ? turns
    : [{ role: "ai", text: fallbackLine || "Interview ended." }];
  return {
    status: "done",
    transcript,
    endedAt,
    endReason: reason,
  };
}

/** The single navigation target used after a successful completion. */
export function resultsPath(id) {
  return `/app/results/${encodeURIComponent(id)}`;
}
