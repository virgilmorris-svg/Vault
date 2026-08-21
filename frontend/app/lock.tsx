import { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Platform, KeyboardAvoidingView,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { secure, K } from "@/src/lib/storage";
import { theme } from "@/src/lib/theme";

export default function LockScreen() {
  const router = useRouter();
  const vault = useVault();
  const { unlockWithMaster, biometricEnabled, logout, user } = vault as any;
  const [master, setMaster] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  useEffect(() => {
    (async () => {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometrics(hw && enrolled);
    })();
  }, []);

  useEffect(() => {
    // If already unlocked, redirect
    if (vault.unlocked) router.replace("/(tabs)/vault");
  }, [vault.unlocked]);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await unlockWithMaster(master);
      router.replace("/(tabs)/vault");
    } catch (e: any) {
      setErr(e.message || "Wrong master password");
    } finally {
      setLoading(false);
    }
  };

  const biometric = async () => {
    setErr(null);
    try {
      const keysStr = await secure.get(K.BIOMETRIC_KEY);
      if (!keysStr) {
        setErr("Enable biometric unlock in Settings first");
        return;
      }
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock SentinelPass",
        fallbackLabel: "Use master password",
      });
      if (!r.success) return;
      const keys = JSON.parse(keysStr);
      // @ts-ignore
      await vault.unlockWithBiometricKeys(keys);
      router.replace("/(tabs)/vault");
    } catch (e: any) {
      setErr(e.message || "Biometric unlock failed");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.c}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable onPress={async () => { await logout(); router.replace("/auth"); }} style={styles.signout} testID="lock-signout">
          <Feather name="log-out" size={16} color={theme.color.onSurfaceTertiary} />
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.icon}>
        <Feather name="lock" size={48} color={theme.color.brand} />
      </View>
      <Text style={styles.title}>Vault locked</Text>
      <Text style={styles.sub}>{user?.email}</Text>

      <View style={styles.formArea}>
        <TextInput
          testID="lock-master"
          style={styles.input}
          placeholder="Master password"
          placeholderTextColor={theme.color.onSurfaceTertiary}
          secureTextEntry
          value={master}
          onChangeText={setMaster}
          onSubmitEditing={submit}
        />
        {err && <Text style={styles.err} testID="lock-error">{err}</Text>}

        <Pressable
          testID="lock-unlock-btn"
          onPress={submit}
          disabled={loading}
          style={({ pressed }) => [styles.cta, (pressed || loading) && { opacity: 0.85 }]}
        >
          {loading ? <ActivityIndicator color={theme.color.onBrand} /> : (
            <Text style={styles.ctaText}>Unlock</Text>
          )}
        </Pressable>

        {biometricEnabled && hasBiometrics && (
          <Pressable
            testID="lock-biometric-btn"
            onPress={biometric}
            style={({ pressed }) => [styles.bio, pressed && { opacity: 0.7 }]}
          >
            <Feather name="unlock" size={20} color={theme.color.brand} />
            <Text style={styles.bioText}>Unlock with biometrics</Text>
          </Pressable>
        )}

        <Pressable
          testID="lock-switch-account"
          onPress={async () => { await logout(); router.replace("/auth"); }}
          style={({ pressed }) => [styles.switchAccount, pressed && { opacity: 0.6 }]}
        >
          <Feather name="user-plus" size={16} color={theme.color.onSurfaceTertiary} />
          <Text style={styles.switchText}>Use a different account or create a new one</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface, padding: 24, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "flex-end" },
  signout: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8 },
  signoutText: { color: theme.color.onSurfaceTertiary, fontSize: 13 },
  icon: {
    alignSelf: "center", marginTop: 40, width: 96, height: 96, borderRadius: 24,
    backgroundColor: "rgba(245,158,11,0.12)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(245,158,11,0.35)",
  },
  title: { color: theme.color.onSurface, fontSize: 24, fontWeight: "800", textAlign: "center", marginTop: 24 },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 14, textAlign: "center", marginTop: 4 },
  formArea: { marginTop: 48 },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, color: theme.color.onSurface, fontSize: 16,
  },
  err: { color: theme.color.error, marginTop: 12, fontSize: 13 },
  cta: { marginTop: 20, backgroundColor: theme.color.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: theme.color.onBrand, fontSize: 16, fontWeight: "700" },
  bio: {
    marginTop: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  bioText: { color: theme.color.brand, fontSize: 14, fontWeight: "600" },
  switchAccount: {
    marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14,
  },
  switchText: { color: theme.color.onSurfaceTertiary, fontSize: 13 },
});
