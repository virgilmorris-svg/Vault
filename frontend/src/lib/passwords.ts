// Password generator + strength scoring
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?/~";
const AMBIGUOUS = new Set(["l", "I", "1", "O", "0", "o"]);

const WORDLIST = [
  "atlas","beacon","cactus","dagger","ember","fable","glide","harbor","impact","jazz",
  "kettle","lantern","meadow","nebula","opal","piston","quartz","raven","sable","tundra",
  "umbra","vector","willow","xenon","yodel","zephyr","anchor","bramble","cinder","dune",
  "eclipse","forest","granite","havoc","ivory","jasper","krypton","legend","monsoon","nectar",
  "ochre","prism","quill","rustle","sonic","talon","undertow","velvet","warden","xylite"
];

export type GenOpts = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
};

function secureRandomInt(max: number): number {
  // fall back to Math.random - acceptable for a client generator; crypto.getRandomValues also acceptable
  if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    (globalThis as any).crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function generatePassword(opts: GenOpts): string {
  let pool = "";
  if (opts.lower) pool += LOWER;
  if (opts.upper) pool += UPPER;
  if (opts.digits) pool += DIGITS;
  if (opts.symbols) pool += SYMBOLS;
  if (opts.avoidAmbiguous) {
    pool = pool.split("").filter((c) => !AMBIGUOUS.has(c)).join("");
  }
  if (!pool.length) pool = LOWER;
  let out = "";
  for (let i = 0; i < opts.length; i++) {
    out += pool[secureRandomInt(pool.length)];
  }
  return out;
}

export function generatePassphrase(count: number, sep: string = "-"): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) parts.push(WORDLIST[secureRandomInt(WORDLIST.length)]);
  // add a random 2-digit suffix for extra entropy
  const suffix = String(secureRandomInt(90) + 10);
  return parts.join(sep) + sep + suffix;
}

// Score: 0..100
export function scorePassword(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "Empty", color: "#EF4444" };
  let score = 0;
  const len = pw.length;
  score += Math.min(len * 4, 40);
  if (/[a-z]/.test(pw)) score += 10;
  if (/[A-Z]/.test(pw)) score += 10;
  if (/\d/.test(pw)) score += 10;
  if (/[^A-Za-z0-9]/.test(pw)) score += 15;
  // variety penalty
  const uniq = new Set(pw).size;
  if (uniq / len < 0.5) score -= 10;
  if (len < 8) score -= 20;
  score = Math.max(0, Math.min(100, score));
  let label = "Very weak";
  let color = "#EF4444";
  if (score >= 80) {
    label = "Excellent";
    color = "#10B981";
  } else if (score >= 60) {
    label = "Strong";
    color = "#10B981";
  } else if (score >= 40) {
    label = "Fair";
    color = "#F59E0B";
  } else if (score >= 20) {
    label = "Weak";
    color = "#F59E0B";
  }
  return { score, label, color };
}
