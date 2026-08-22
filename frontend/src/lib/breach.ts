// Breach check using HaveIBeenPwned k-anonymity model.
// Client computes SHA-1 of password, sends only the first 5 hex chars to our backend.
// Backend queries HIBP and returns list of suffixes+counts. Client checks locally.
import CryptoJS from "crypto-js";
import { api } from "./api";

export type BreachInfo = { count: number };

const cache = new Map<string, number>(); // prefix -> lookup result for hash suffix

export async function checkPassword(password: string): Promise<number> {
  if (!password) return 0;
  const sha1 = CryptoJS.SHA1(password).toString(CryptoJS.enc.Hex).toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const cacheKey = sha1;
  if (cache.has(cacheKey)) return cache.get(cacheKey) || 0;
  try {
    const r = await api<{ suffixes: string }>("/api/breach/check", {
      method: "POST",
      body: JSON.stringify({ prefix }),
    });
    const lines = (r.suffixes || "").split("\n");
    let count = 0;
    for (const line of lines) {
      const [suf, cnt] = line.trim().split(":");
      if (suf?.toUpperCase() === suffix) {
        count = parseInt(cnt || "0", 10);
        break;
      }
    }
    cache.set(cacheKey, count);
    return count;
  } catch {
    return 0;
  }
}
