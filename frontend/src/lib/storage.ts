// Storage layer using expo-secure-store on native and localStorage on web.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export const secure = {
  async get(k: string): Promise<string | null> {
    if (isWeb) {
      try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; }
    }
    return await SecureStore.getItemAsync(k);
  },
  async set(k: string, v: string): Promise<void> {
    if (isWeb) {
      try { globalThis.localStorage?.setItem(k, v); } catch {}
      return;
    }
    await SecureStore.setItemAsync(k, v);
  },
  async del(k: string): Promise<void> {
    if (isWeb) {
      try { globalThis.localStorage?.removeItem(k); } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(k);
  },
};

export const K = {
  ACCESS: "sp_access",
  REFRESH: "sp_refresh",
  USER: "sp_user",
  KDF_SALT: "sp_kdf_salt",
  VAULT_LOCAL: "sp_vault_local", // encrypted vault cached locally
  VAULT_VERSION: "sp_vault_ver",
  BIOMETRIC_KEY: "sp_bio_key", // stored keys hex under biometric protection
  BIOMETRIC_ENABLED: "sp_bio_enabled",
  AUTOLOCK_MINUTES: "sp_autolock_minutes",
  VERIFIER: "sp_verifier",
};
