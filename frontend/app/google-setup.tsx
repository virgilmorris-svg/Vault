import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { scorePassword } from "@/src/lib/passwords";

export default function GoogleSetupScreen() {
  const router = useRouter();
  const vault = useVault() as any;
  const [master, setMaster] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const strength = scorePassword(master);

  const submit = async () => {
    setErr(null);
    if (master.length < 12) return setErr("Master password must be at least 12 characters");
    if (master !== confirm) return setErr("Master passwords do not match");
    setLoading(true);
    try {
      await vault.setupMasterForGoogleUser(master);
      router.replace("/(tabs)/vault");
    } catch (e: any) {
      setErr(e.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.color.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60 }}>
          <View style={styles.icon}>
            <Feather name="key" size={40} color={theme.color.brand} />
          </View>
          <Text style={styles.title}>Create your master password</Text>
          <Text style={styles.sub}>
            Signed in as <Text style={{ color: theme.color.onSurface }}>{vault.user?.email}</Text>. Your master password encrypts your vault locally and never leaves this device. It cannot be recovered.
          </Text>

          <Text style={styles.label}>Master password</Text>
          <TextInput
            testID="gsetup-master"
            style={styles.input}
            placeholder="12+ characters"
            placeholderTextColor={theme.color.onSurfaceTertiary}
            secureTextEntry
            value={master}
            onChangeText={setMaster}
          />
          {master.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthBar}>
                <View style={[styles.strengthFill, { width: `${strength.score}%`, backgroundColor: strength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}
          <Text style={styles.label}>Confirm master password</Text>
          <TextInput
            testID="gsetup-confirm"
            style={styles.input}
            placeholder="Repeat"
            placeholderTextColor={theme.color.onSurfaceTertiary}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
          {err && <Text style={styles.err}>{err}</Text>}
          <Pressable testID="gsetup-submit" onPress={submit} disabled={loading} style={({ pressed }) => [styles.cta, (pressed || loading) && { opacity: 0.85 }]}>
            {loading ? <ActivityIndicator color={theme.color.onBrand} /> : <Text style={styles.ctaText}>Create secure vault</Text>}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  icon: { alignSelf: "center", width: 80, height: 80, borderRadius: 20, backgroundColor: "rgba(245,158,11,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: "rgba(245,158,11,0.35)" },
  title: { color: theme.color.onSurface, fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 19 },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "600", marginTop: 20, marginBottom: 6 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: theme.color.onSurface, fontSize: 15 },
  strengthRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceTertiary, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: "600" },
  err: { color: theme.color.error, marginTop: 12 },
  cta: { marginTop: 24, backgroundColor: theme.color.brand, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: theme.color.onBrand, fontSize: 16, fontWeight: "700" },
});
