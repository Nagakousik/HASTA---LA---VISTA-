/**
 * nameValidation.js
 *
 * Validates candidate authorized full name against format criteria and placeholder/joke patterns.
 * NOTE: This is client-side heuristic validation to ensure appropriate and professional representation.
 * It does NOT verify identity against official college/government databases or identity documents.
 */

const JOKE_OR_PLACEHOLDER = new Set([
  "john doe", "jane doe", "test user", "test name", "tester", "testing",
  "anonymous", "anon", "admin", "administrator", "root", "guest", "null", "undefined",
  "na", "n/a", "none", "nobody", "no name", "someone", "candidate", "student", "user",
  "interviewee", "recruiter", "batman", "superman", "spiderman", "ironman", "bruce wayne",
  "clark kent", "peter parker", "mickey mouse", "donald duck", "harry potter",
  "foo bar", "foobar", "lorem ipsum", "asdf asdf", "qwerty uiop", "dummy user",
  "sample user", "my name", "first last", "first name", "last name", "full name",
  "fake name", "not real", "no one", "hello world", "test candidate"
]);

const FORBIDDEN_TOKENS = new Set([
  "admin", "administrator", "root", "guest", "test", "tester", "testing",
  "null", "undefined", "anonymous", "anon", "hacker", "placeholder", "fake",
  "dummy", "bot", "nobody", "nowhere", "sample", "demo"
]);

// Common inappropriate / abusive words to prevent provocative display names
const ABUSIVE_PATTERN = /\b(fuck|shit|bitch|asshole|dick|pussy|bastard|cunt|nigger|faggot|retard|idiot|stupid|moron|dumb|kill|nazi|hitler)\b/i;

export function validateCandidateName(rawName = "") {
  const trimmed = String(rawName || "").trim().replace(/\s+/g, " ");

  if (!trimmed) {
    return {
      valid: false,
      error: "Please enter your full legal name as it appears on your official ID.",
      name: trimmed,
    };
  }

  // Minimum length check
  if (trimmed.length < 3) {
    return {
      valid: false,
      error: "Name is too short. Please provide your complete first and last name.",
      name: trimmed,
    };
  }

  if (trimmed.length > 70) {
    return {
      valid: false,
      error: "Name is too long (maximum 70 characters).",
      name: trimmed,
    };
  }

  // Allow unicode letters, spaces, hyphens, periods, and apostrophes
  const validChars = /^[\p{L}\p{M}\s.'-]+$/u;
  if (!validChars.test(trimmed)) {
    return {
      valid: false,
      error: "Name contains invalid characters. Only letters, spaces, hyphens, periods, and apostrophes are allowed.",
      name: trimmed,
    };
  }

  // Split into tokens
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  // Require at least two tokens (first name + last name)
  if (tokens.length < 2) {
    return {
      valid: false,
      error: "Please provide both your first name and last name (e.g., Rahul Sharma or Jane Doe).",
      name: trimmed,
    };
  }

  // Each token must have at least one letter
  const letterCount = (str) => (str.match(/[\p{L}]/gu) || []).length;
  const validTokens = tokens.filter((t) => letterCount(t) >= 1);
  if (validTokens.length < 2) {
    return {
      valid: false,
      error: "Please provide a valid first and last name.",
      name: trimmed,
    };
  }

  // Check against placeholder/joke blocklist (full name match)
  const lower = trimmed.toLowerCase();
  if (JOKE_OR_PLACEHOLDER.has(lower)) {
    return {
      valid: false,
      error: "Please enter your real, authorized name. Fictitious or placeholder names are not permitted.",
      name: trimmed,
    };
  }

  // Check individual tokens for placeholder/role words and keyboard mashing
  for (const token of tokens) {
    const cleanToken = token.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_TOKENS.has(cleanToken)) {
      return {
        valid: false,
        error: "Please enter your real, authorized name. Fictitious or placeholder words are not permitted.",
        name: trimmed,
      };
    }
    // Tokens of 3 or more letters must contain at least one vowel
    if (cleanToken.length >= 3 && !/[aeiouy]/.test(cleanToken)) {
      return {
        valid: false,
        error: "Please enter a valid, recognizable name.",
        name: trimmed,
      };
    }
  }

  // Check for abusive/provocative content
  if (ABUSIVE_PATTERN.test(lower)) {
    return {
      valid: false,
      error: "Inappropriate or abusive names are strictly prohibited. Please enter your authorized name.",
      name: trimmed,
    };
  }

  // Check for obvious keyboard mashing or repetitive characters
  const hasRepetitiveLetters = /(.)\1{3,}/i.test(trimmed);
  if (hasRepetitiveLetters) {
    return {
      valid: false,
      error: "Please enter a valid, recognizable name without repetitive characters.",
      name: trimmed,
    };
  }

  return {
    valid: true,
    error: "",
    name: trimmed,
  };
}
