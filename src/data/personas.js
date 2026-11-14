/**
 * The 6 fictional recruiters: 3 male, 3 female.
 * The interview room renders each one as a tinted initials avatar.
 */
export const PERSONAS = [
  { id: "sarkaar", name: "Sarkaar",        title: "Senior Technical Recruiter", gender: "male",   tint: ["#d6e9f8", "#e8daef"] },
  { id: "aadhi",   name: "Aadhi",          title: "Engineering Hiring Lead",    gender: "male",   tint: ["#e2f0d9", "#d6e9f8"] },
  { id: "rahul",   name: "Rahul Jayakar",  title: "Campus Hiring Manager",      gender: "male",   tint: ["#e8daef", "#fde8d7"] },
  { id: "arohi",   name: "Arohi Sharma",   title: "Senior Technical Recruiter", gender: "female", tint: ["#e8daef", "#d6e9f8"] },
  { id: "tara",    name: "Tara Agnihotri", title: "Engineering Hiring Lead",    gender: "female", tint: ["#fde8d7", "#e2f0d9"] },
  { id: "radhima", name: "Radhima",        title: "Campus Hiring Manager",      gender: "female", tint: ["#d6e9f8", "#e2f0d9"] },
];

export const personaById = (id) => PERSONAS.find((p) => p.id === id) || null;

/**
 * Alternates gender every interview (male, female, male...) and never repeats the
 * previous face of that gender. history = { last: "male" | "female", male: id, female: id }
 */
export function pickPersona(history, random = Math.random) {
  const last = history?.last;
  const gender = last === "male" ? "female" : last === "female" ? "male" : random() < 0.5 ? "male" : "female";
  const pool = PERSONAS.filter((p) => p.gender === gender);
  const fresh = pool.filter((p) => p.id !== history?.[gender]);
  const list = fresh.length ? fresh : pool;
  return list[Math.floor(random() * list.length)];
}

export const nextHistory = (history, persona) => ({ ...(history || {}), [persona.gender]: persona.id, last: persona.gender });