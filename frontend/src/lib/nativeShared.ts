// Syncs a REDACTED list of vault entries (id, title, username, url — no passwords)
// to the shared storage read by the iOS widget/autofill (App Group UserDefaults)
// and the Android widget/autofill (SharedPreferences).
//
// In Expo Go / preview, native shared storage is unavailable so this is a no-op.
// The custom native module `VauLtShared` (bundled by the config plugin at
// prebuild time) exposes `setEntries(json)` which writes to App Group
// UserDefaults on iOS and SharedPreferences on Android.
import { NativeModules, Platform } from "react-native";
import type { VaultEntry } from "./vault";

export type EntryStub = { id: string; title: string; username?: string; url?: string };

export async function syncEntriesToNativeSharedStorage(entries: VaultEntry[]) {
  if (Platform.OS === "web") return;
  const stubs: EntryStub[] = entries
    .filter((e) => e.category === "login")
    .slice(0, 20)
    .map((e) => ({ id: e.id, title: e.title, username: e.username, url: e.url }));
  const payload = JSON.stringify(stubs);
  try {
    const mod = (NativeModules as any).VauLtShared;
    if (mod?.setEntries) {
      await mod.setEntries(payload);
    }
  } catch {
    // Expected in Expo Go — native module not linked.
  }
}
