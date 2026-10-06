// API client with automatic refresh
import { secure, K } from "./storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const REQUEST_TIMEOUT_MS = 15000;

async function refreshTokens(): Promise<boolean> {
  const rt = await secure.get(K.REFRESH);
  if (!rt) return false;
  try {
    const r = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    await secure.set(K.ACCESS, j.access_token);
    await secure.set(K.REFRESH, j.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {},
  auth: boolean = true,
  retried: boolean = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as any) || {}),
  };
  if (auth) {
    const tok = await secure.get(K.ACCESS);
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("The server took too long to respond. Check your connection and try again.");
    }
    throw new Error("Unable to reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 && auth && !retried) {
    const ok = await refreshTokens();
    if (ok) return api<T>(path, init, auth, true);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.detail || j.message || msg;
    } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as any;
}

export const authApi = {
  getSalt: (email: string) => api<{ kdf_salt: string }>(`/api/user/salt?email=${encodeURIComponent(email)}`, {}, false),
  register: (email: string, password: string, kdf_salt: string) =>
    api<any>(`/api/auth/register`, { method: "POST", body: JSON.stringify({ email, password, kdf_salt }) }, false),
  login: (email: string, password: string) =>
    api<any>(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }, false),
  logout: (refresh_token: string) =>
    api<any>(`/api/auth/logout`, { method: "POST", body: JSON.stringify({ refresh_token }) }, false),
  me: () => api<any>(`/api/me`),
  deleteAccount: (confirmation: string, password?: string) =>
    api<any>(`/api/account`, { method: "DELETE", body: JSON.stringify({ confirmation, password }) }),
};

export const vaultApi = {
  get: () => api<{ blob: string | null; version: number }>(`/api/vault`),
  put: (blob: string, version: number) =>
    api<any>(`/api/vault`, { method: "PUT", body: JSON.stringify({ blob, version }) }),
};

export const sessionsApi = {
  list: () => api<any[]>(`/api/sessions`),
  revoke: (id: string) => api<any>(`/api/sessions/${id}`, { method: "DELETE" }),
};
