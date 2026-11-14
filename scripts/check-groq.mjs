/**
 * check-groq.mjs: one tiny request that proves the free Groq key works before you present.
 *
 *   npm run check:ai
 *
 * Reads the key from GROQ_API_KEY, .env.local or .env (in that order), asks for a single
 * short sentence, then prints the HTTP status and the free-tier request budget left today.
 * It uses about 40 tokens: negligible against the free allowance.
 *
 * Groq's free tier needs no payment method and has no per-token charge; if the key is
 * missing, invalid or rate-limited, the app simply runs the scripted interview instead.
 */

import fs from "node:fs";
import path from "node:path";

const readEnvFile = (file) => {
  try {
    const text = fs.readFileSync(file, "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
    return out;
  } catch {
    return {};
  }
};

const root = process.cwd();
const env = { ...readEnvFile(path.join(root, ".env")), ...readEnvFile(path.join(root, ".env.local")) };
const key = (process.env.GROQ_API_KEY || env.GROQ_API_KEY || "").trim();
const model = (process.env.GROQ_MODEL || env.VITE_GROQ_MODEL || "qwen/qwen3.8-27b").trim();

const mask = (k) => (k.length > 12 ? `${k.slice(0, 7)}...${k.slice(-4)}` : `${k.slice(0, 4)}...`);

if (!key) {
  console.log("\nNo Groq key found. That is fine: the app will run the scripted interview, with no network calls at all.");
  console.log("To enable the natural-language layer, copy .env.example to .env.local and paste your free key.\n");
  process.exit(0);
}

console.log(`\nKey   : ${mask(key)}`);
console.log(`Model : ${model}`);
console.log("Calling Groq (free tier, no charge)...");

const started = Date.now();
try {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 24,
      temperature: 0,
      messages: [{ role: "user", content: "Reply with exactly: ready" }],
    }),
  });
  const ms = Date.now() - started;
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.log(`\nFAILED: HTTP ${res.status} in ${ms} ms`);
    console.log(body?.error?.message || JSON.stringify(body).slice(0, 300));
    if (res.status === 401 || res.status === 403) console.log("That key looks wrong or revoked. Create a new one at https://console.groq.com/keys");
    if (res.status === 429) console.log("Rate limited right now. The app will keep using the scripted lines, so a demo still runs.");
    if (res.status === 404 || res.status === 400) console.log(`The model "${model}" may be retired. The app automatically falls back to llama-3.1-8b-instant.`);
    process.exit(1);
  }

  const left = res.headers.get("x-ratelimit-remaining-requests");
  const limit = res.headers.get("x-ratelimit-limit-requests");
  const reply = body?.choices?.[0]?.message?.content?.trim() || "(empty)";
  console.log(`\nOK: HTTP ${res.status} in ${ms} ms, reply "${reply}"`);
  if (left && limit) console.log(`Requests left today: ${left} of ${limit}`);
  console.log("\nA 15 minute interview uses roughly 12-16 turns, so one presentation costs well under 1% of the daily free budget.");
  console.log("If the network or the quota ever fails, the room falls back to the scripted interview automatically.\n");
} catch (err) {
  console.log(`\nFAILED: could not reach Groq (${err.message}).`);
  console.log("The app will use the scripted interview, so the presentation still runs offline.\n");
  process.exit(1);
}
