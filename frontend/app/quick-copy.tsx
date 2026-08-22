// Quick Copy — fast surface that mimics the future home-screen widget UX.
// Biometric gate → compact list → single tap copies the password.
import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform,
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";

export default function QuickCopyScreen() {
  const router = useRouter();
  const vault = useVault();
  const [unlocked, setUnlocked] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    // Auto-attempt biometric on mount
    (async () => {
      if (!vault.unlocked || !vault.keys) return;
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hw || !enrolled || Platform.OS === "web") {
        setUnlocked(true);
        setAttempted(true);
        return;
      }
      try {
        const r = await LocalAuthentication.authenticateAsync({
          promptMessage: "Quick Copy — authenticate to reveal passwords",
        });
        setUnlocked(r.success);
      } catch {}
      setAttempted(true);
    })();
  }, []);

  const copy = async (id: string, pw?: string) => {
    if (!pw) return;
    await Clipboard.setStringAsync(pw);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const logins = (vault.vault?.entries || []).filter((e) => e.category === "login" && e.password);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="quick-back">
          <Feather name="chevron-left" size={22} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>Quick Copy</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tagline}>
        <Feather name="zap" size={14} color={theme.color.brand} />
        <Text style={styles.taglineText}>Tap a login. Password copied. Done.</Text>
      </View>

      {!attempted ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : !unlocked ? (
        <View style={styles.center}>
          <Feather name="shield-off" size={40} color={theme.color.error} />
          <Text style={styles.blockedTitle}>Authentication required</Text>
          <Text style={styles.blockedSub}>Quick Copy needs biometric verification.</Text>
          <Pressable onPress={() => router.back()} style={styles.blockedBtn}>
            <Text style={styles.blockedBtnText}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {logins.length === 0 && (
            <Text style={styles.empty}>No logins to copy yet.</Text>
          )}
          {logins.map((l) => {
            const copied = copiedId === l.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => copy(l.id, l.password)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.color.surfaceTertiary }]}
                testID={`quick-row-${l.id}`}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(l.title || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{l.title}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{l.username || l.url || "—"}</Text>
                </View>
                <View style={[styles.copyBadge, copied && { backgroundColor: theme.color.success + "22", borderColor: theme.color.success }]}>
                  <Feather name={copied ? "check" : "copy"} size={16} color={copied ? theme.color.success : theme.color.brand} />
                  <Text style={[styles.copyText, copied && { color: theme.color.success }]}>{copied ? "Copied" : "Copy"}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800" },
  tagline: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 8 },
  taglineText: { color: theme.color.onSurfaceTertiary, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  blockedTitle: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginTop: 12 },
  blockedSub: { color: theme.color.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
  blockedBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.color.surfaceTertiary },
  blockedBtnText: { color: theme.color.onSurface, fontWeight: "600" },
  empty: { color: theme.color.onSurfaceTertiary, textAlign: "center", marginTop: 40 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8,
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 12,
    borderWidth: 1, borderColor: theme.color.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.color.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: theme.color.brand, fontSize: 16, fontWeight: "700" },
  rowTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600" },
  rowSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  copyBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: theme.color.brand + "22",
    borderWidth: 1, borderColor: theme.color.brand + "55",
  },
  copyText: { color: theme.color.brand, fontSize: 12, fontWeight: "700" },
});
