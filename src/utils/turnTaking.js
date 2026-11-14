/**
 * turnTaking.js: conversational rules and intelligent candidate non-response handling.
 */

// Intelligent Non-Response Sequence (Section 13)
export const NON_RESPONSE_TIMEOUT_MS = 20000; // 20 seconds wait per stage
export const FOLLOW_UP_1 = "Would you like a little more time to answer?";
export const FOLLOW_UP_2 = "Would you like to try answering this question once again?";
export const CONCLUSION_LINE = "That's alright. It seems you don't wish to answer this question. Thank you for your time. Let's conclude the meeting here.";

// Spoken once when the selected interview duration runs out.
export const TIME_CLOSING_LINE = "We're at the end of our scheduled time, so let's stop there. Thank you for the conversation today. We'll be in touch about the next steps.";

// Legacy aliases preserved for backwards compatibility
export const NUDGE_MS = 20000;
export const AFTER_NUDGE_MS = 20000;
export const NUDGE_LINE = FOLLOW_UP_1;

export const wordCount = (t = "") => (t.trim().match(/\S+/g) || []).length;

/**
 * Adaptive end-of-answer silence.
 *
 * Speech recognition emits `final` results per phrase, not per answer. A short
 * fixed wait therefore turns a normal breath between sentences into a submitted
 * answer. The wait grows with the answer length (longer explanations tend to
 * contain longer thinking pauses) and is clamped so the interview can never hang:
 *
 *   few words    -> 5.0s   (candidate is probably still composing)
 *   ~30 words    -> 6.5s   (a normal sentence pause is safely shorter)
 *   ~60+ words   -> 8.0s   (give long explanations room to breathe)
 */
export const SILENCE_MIN_MS = 5000;
export const SILENCE_MAX_MS = 8000;
export const SILENCE_PER_WORD_MS = 50;

export const silenceFor = (words = 0) => {
  const w = Math.max(0, Number(words) || 0);
  return Math.min(SILENCE_MAX_MS, Math.max(SILENCE_MIN_MS, SILENCE_MIN_MS + w * SILENCE_PER_WORD_MS));
};

const REPEAT = /\b(repeat|say that again|say it again|come again|pardon|one more time|re-?phrase|(did not|didn'?t|couldn'?t|could not) (catch|hear|get|understand))\b/i;

/** "Sorry, could you repeat that?" is a request, not an answer. Long answers are never treated as requests. */
export const isRepeatRequest = (text = "") => wordCount(text) <= 12 && REPEAT.test(text);
