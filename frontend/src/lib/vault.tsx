// Vault state management (React Context)
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { secure, K } from "./storage";
import { deriveKeys, encrypt, decrypt, randomSaltB64, verifierHash, KeyMaterial } from "./crypto";
import { authApi, vaultApi, api } from "./api";

export type VaultCategory = "login" | "card" | "identity" | "note";

export type VaultEntry = {
  id: string;
  category: VaultCategory;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  // card
  cardholder?: string;
  card_number?: string;
  expiry?: string;
  cvv?: string;
  // identity
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  // media attachments
  attachments?: Array<{ file_id: string; mime: string; kind: "image" | "video"; name: string; size: number; created_at: string }>;
  created_at: string;
  updated_at: string;
};

export type Vault = {
  entries: VaultEntry[];
  verifier: string;
};

type State = {
  authed: boolean;
  unlocked: boolean;
  loading: boolean;
  user: any | null;
  vault: Vault | null;
  keys: KeyMaterial | null;
  version: number;
  autolockMinutes: number;
  biometricEnabled: boolean;
};

type Ctx = State & {
  signup: (email: string, password: string, master: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  unlockWithMaster: (master: string) => Promise<void>;
  lock: () => void;
  addEntry: (e: Omit<VaultEntry, "id" | "created_at" | "updated_at">) => Promise<VaultEntry>;
  updateEntry: (id: string, patch: Partial<VaultEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  sync: () => Promise<void>;
  setAutolock: (m: number) => Promise<void>;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  exportEncrypted: () => Promise<string>;
  importEncrypted: (blob: string, master: string) => Promise<void>;
};

const VaultCtx = createContext<Ctx | null>(null);

function newId() {
  return "e_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({
    authed: false,
    unlocked: false,
    loading: true,
    user: null,
    vault: null,
    keys: null,
    version: 0,
    autolockMinutes: 5,
    biometricEnabled: false,
  });

  const lockTimer = useRef<any>(null);
  const backgroundedAt = useRef<number | null>(null);

  const persistState = state;

  const load = useCallback(async () => {
    const access = await secure.get(K.ACCESS);
    const userStr = await secure.get(K.USER);
    const autolockStr = await secure.get(K.AUTOLOCK_MINUTES);
    const bio = (await secure.get(K.BIOMETRIC_ENABLED)) === "1";
    setState((s) => ({
      ...s,
      authed: !!access && !!userStr,
      user: userStr ? JSON.parse(userStr) : null,
      loading: false,
      autolockMinutes: autolockStr ? parseInt(autolockStr, 10) : 5,
      biometricEnabled: bio,
    }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-lock on background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        backgroundedAt.current = Date.now();
        // "Immediately" = lock on background without waiting
        if (state.autolockMinutes === 0 && state.unlocked) {
          lock();
        }
      } else if (next === "active" && backgroundedAt.current) {
        const awayMin = (Date.now() - backgroundedAt.current) / 60000;
        if (state.unlocked && (state.autolockMinutes === 0 || awayMin >= state.autolockMinutes)) {
          lock();
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [state.autolockMinutes, state.unlocked]);

  const lock = useCallback(() => {
    setState((s) => ({ ...s, unlocked: false, vault: null, keys: null }));
  }, []);

  const signup = async (email: string, password: string, master: string) => {
    const salt = randomSaltB64();
    const keys = deriveKeys(master, salt);
    const tokens = await authApi.register(email, password, salt);
    await secure.set(K.ACCESS, tokens.access_token);
    await secure.set(K.REFRESH, tokens.refresh_token);
    await secure.set(K.USER, JSON.stringify(tokens.user));
    await secure.set(K.KDF_SALT, salt);
    // Init empty vault + verifier
    const verifier = verifierHash(keys);
    const vault: Vault = { entries: [], verifier };
    const blob = encrypt(JSON.stringify(vault), keys);
    await vaultApi.put(blob, 1);
    await secure.set(K.VAULT_LOCAL, blob);
    await secure.set(K.VAULT_VERSION, "1");
    await secure.set(K.VERIFIER, verifier);
    setState((s) => ({
      ...s,
      authed: true,
      unlocked: true,
      user: tokens.user,
      vault,
      keys,
      version: 1,
    }));
  };

  const login = async (email: string, password: string) => {
    const tokens = await authApi.login(email, password);
    const saltResp = await authApi.getSalt(email);
    await secure.set(K.ACCESS, tokens.access_token);
    await secure.set(K.REFRESH, tokens.refresh_token);
    await secure.set(K.USER, JSON.stringify(tokens.user));
    await secure.set(K.KDF_SALT, saltResp.kdf_salt);
    setState((s) => ({ ...s, authed: true, user: tokens.user, unlocked: false }));
  };

  const loginWithSessionId = async (session_id: string) => {
    const tokens = await api<any>("/api/auth/google/session", {
      method: "POST", body: JSON.stringify({ session_id }),
    }, false);
    await secure.set(K.ACCESS, tokens.access_token);
    await secure.set(K.REFRESH, tokens.refresh_token);
    await secure.set(K.USER, JSON.stringify(tokens.user));
    if (tokens.user?.kdf_salt) {
      await secure.set(K.KDF_SALT, tokens.user.kdf_salt);
    } else {
      await secure.del(K.KDF_SALT);
    }
    setState((s) => ({ ...s, authed: true, user: tokens.user, unlocked: false }));
    return tokens.user;
  };

  const setupMasterForGoogleUser = async (master: string) => {
    const salt = randomSaltB64();
    const keys = deriveKeys(master, salt);
    await api<any>("/api/user/kdf-salt", { method: "PUT", body: JSON.stringify({ kdf_salt: salt }) });
    await secure.set(K.KDF_SALT, salt);
    const verifier = verifierHash(keys);
    const vault: Vault = { entries: [], verifier };
    const blob = encrypt(JSON.stringify(vault), keys);
    await vaultApi.put(blob, 1);
    await secure.set(K.VAULT_LOCAL, blob);
    await secure.set(K.VAULT_VERSION, "1");
    setState((s) => ({ ...s, unlocked: true, vault, keys, version: 1 }));
  };

  const unlockWithMaster = async (master: string) => {
    const salt = await secure.get(K.KDF_SALT);
    if (!salt) throw new Error("Missing salt — please sign in again");
    const keys = deriveKeys(master, salt);
    // Try fetch remote vault first
    let blob: string | null = null;
    let version = 0;
    try {
      const remote = await vaultApi.get();
      blob = remote.blob;
      version = remote.version;
      if (blob) {
        await secure.set(K.VAULT_LOCAL, blob);
        await secure.set(K.VAULT_VERSION, String(version));
      }
    } catch {
      // Offline: try local
      blob = await secure.get(K.VAULT_LOCAL);
      version = parseInt((await secure.get(K.VAULT_VERSION)) || "0", 10);
    }
    let vault: Vault;
    if (blob) {
      const plain = decrypt(blob, keys); // throws if wrong password
      vault = JSON.parse(plain) as Vault;
    } else {
      const verifier = verifierHash(keys);
      vault = { entries: [], verifier };
      const b = encrypt(JSON.stringify(vault), keys);
      await vaultApi.put(b, 1);
      await secure.set(K.VAULT_LOCAL, b);
      await secure.set(K.VAULT_VERSION, "1");
      version = 1;
    }
    await secure.set(K.VERIFIER, vault.verifier);
    // Cache keys for biometric unlock if enabled
    if ((await secure.get(K.BIOMETRIC_ENABLED)) === "1") {
      await secure.set(K.BIOMETRIC_KEY, JSON.stringify(keys));
    }
    setState((s) => ({ ...s, unlocked: true, vault, keys, version }));
  };

  const unlockWithBiometricKeys = async (keys: KeyMaterial) => {
    let blob: string | null = null;
    let version = 0;
    try {
      const remote = await vaultApi.get();
      blob = remote.blob;
      version = remote.version;
    } catch {
      blob = await secure.get(K.VAULT_LOCAL);
      version = parseInt((await secure.get(K.VAULT_VERSION)) || "0", 10);
    }
    if (!blob) throw new Error("No vault available");
    const plain = decrypt(blob, keys);
    const vault: Vault = JSON.parse(plain);
    setState((s) => ({ ...s, unlocked: true, vault, keys, version }));
  };

  const logout = async () => {
    const rt = await secure.get(K.REFRESH);
    if (rt) {
      try { await authApi.logout(rt); } catch {}
    }
    await secure.del(K.ACCESS);
    await secure.del(K.REFRESH);
    await secure.del(K.USER);
    await secure.del(K.KDF_SALT);
    await secure.del(K.VAULT_LOCAL);
    await secure.del(K.VAULT_VERSION);
    await secure.del(K.BIOMETRIC_KEY);
    await secure.del(K.BIOMETRIC_ENABLED);
    await secure.del(K.VERIFIER);
    setState({
      authed: false, unlocked: false, loading: false, user: null,
      vault: null, keys: null, version: 0, autolockMinutes: 5, biometricEnabled: false,
    });
  };

  const persistVault = useCallback(async (vault: Vault, keys: KeyMaterial, prevVersion: number) => {
    const nextV = prevVersion + 1;
    const blob = encrypt(JSON.stringify(vault), keys);
    try {
      await vaultApi.put(blob, nextV);
    } catch (e) {
      // Save locally anyway; will retry on next action
    }
    await secure.set(K.VAULT_LOCAL, blob);
    await secure.set(K.VAULT_VERSION, String(nextV));
    // Sync redacted stubs to native shared storage (widget/autofill).
    try {
      const { syncEntriesToNativeSharedStorage } = require("./nativeShared");
      await syncEntriesToNativeSharedStorage(vault.entries);
    } catch {}
    setState((s) => ({ ...s, vault, version: nextV }));
  }, []);

  const addEntry = async (e: Omit<VaultEntry, "id" | "created_at" | "updated_at">) => {
    if (!state.vault || !state.keys) throw new Error("Vault locked");
    const now = new Date().toISOString();
    const entry: VaultEntry = { ...e, id: newId(), created_at: now, updated_at: now };
    const vault: Vault = { ...state.vault, entries: [entry, ...state.vault.entries] };
    await persistVault(vault, state.keys, state.version);
    return entry;
  };

  const updateEntry = async (id: string, patch: Partial<VaultEntry>) => {
    if (!state.vault || !state.keys) throw new Error("Vault locked");
    const now = new Date().toISOString();
    const entries = state.vault.entries.map((x) => (x.id === id ? { ...x, ...patch, updated_at: now } : x));
    const vault: Vault = { ...state.vault, entries };
    await persistVault(vault, state.keys, state.version);
  };

  const deleteEntry = async (id: string) => {
    if (!state.vault || !state.keys) throw new Error("Vault locked");
    const entries = state.vault.entries.filter((x) => x.id !== id);
    const vault: Vault = { ...state.vault, entries };
    await persistVault(vault, state.keys, state.version);
  };

  const sync = async () => {
    if (!state.keys) return;
    const remote = await vaultApi.get();
    if (remote.blob && remote.version > state.version) {
      const plain = decrypt(remote.blob, state.keys);
      const v: Vault = JSON.parse(plain);
      await secure.set(K.VAULT_LOCAL, remote.blob);
      await secure.set(K.VAULT_VERSION, String(remote.version));
      setState((s) => ({ ...s, vault: v, version: remote.version }));
    }
  };

  const setAutolock = async (m: number) => {
    await secure.set(K.AUTOLOCK_MINUTES, String(m));
    setState((s) => ({ ...s, autolockMinutes: m }));
  };

  const setBiometricEnabled = async (on: boolean) => {
    if (on && state.keys) {
      await secure.set(K.BIOMETRIC_KEY, JSON.stringify(state.keys));
      await secure.set(K.BIOMETRIC_ENABLED, "1");
    } else {
      await secure.del(K.BIOMETRIC_KEY);
      await secure.set(K.BIOMETRIC_ENABLED, "0");
    }
    setState((s) => ({ ...s, biometricEnabled: on }));
  };

  const exportEncrypted = async () => {
    const blob = await secure.get(K.VAULT_LOCAL);
    return blob || "";
  };

  const importEncrypted = async (blob: string, master: string) => {
    const salt = await secure.get(K.KDF_SALT);
    if (!salt) throw new Error("Salt missing");
    const keys = deriveKeys(master, salt);
    const plain = decrypt(blob, keys);
    const v: Vault = JSON.parse(plain);
    await persistVault(v, keys, state.version);
    setState((s) => ({ ...s, keys, unlocked: true }));
  };

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      signup, login, logout, unlockWithMaster, lock,
      addEntry, updateEntry, deleteEntry, sync,
      setAutolock, setBiometricEnabled,
      exportEncrypted, importEncrypted,
      // @ts-ignore
      unlockWithBiometricKeys, loginWithSessionId, setupMasterForGoogleUser,
    }),
    [state],
  );

  return <VaultCtx.Provider value={value}>{children}</VaultCtx.Provider>;
}

export function useVault() {
  const v = useContext(VaultCtx);
  if (!v) throw new Error("useVault must be used within VaultProvider");
  return v;
}
