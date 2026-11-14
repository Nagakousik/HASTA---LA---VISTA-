/**
 * interviewClock.js: one authoritative interview deadline.
 *
 * The countdown is never accumulated from interval ticks, and it is never paused
 * or rebased for TTS, reconnects, or tab throttling. Every visible value and every
 * completion decision is derived from `deadline - Date.now()`, so a five-minute
 * interview is a real five minutes of wall-clock time.
 */

export const MINUTE_MS = 60000;

export function createDeadline(startedAt, minutes) {
  const safeMinutes = Math.max(1, Number(minutes) || 1);
  const totalMs = safeMinutes * MINUTE_MS;
  const start = Number.isFinite(startedAt) ? startedAt : Date.now();
  return { startedAt: start, deadline: start + totalMs, totalMs };
}

export function remainingMs(deadline, now = Date.now()) {
  if (!Number.isFinite(deadline)) return 0;
  return Math.max(0, deadline - now);
}

export function secondsLeft(deadline, now = Date.now()) {
  return Math.ceil(remainingMs(deadline, now) / 1000);
}

export function hasExpired(deadline, now = Date.now()) {
  return remainingMs(deadline, now) <= 0;
}

/** 0 at the start, 1 at the deadline. Used only to pick the conversational phase. */
export function elapsedFraction(deadline, totalMs, now = Date.now()) {
  if (!Number.isFinite(totalMs) || totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(deadline, now) / totalMs));
}
