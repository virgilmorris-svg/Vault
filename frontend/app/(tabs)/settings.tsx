import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { sessionsApi } from "@/src/lib/api";

const AUTOLOCK_OPTIONS = [
  { label: "Immediately", value: 0 },
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
];

export default function SettingsScreen() {
  const router = useRouter();
  const vault = useVault();
  const { user, autolockMinutes, setAutolock, biometricEnabled, setBiometricEnabled, lock, logout, exportEncrypted } = vault as any;
  const [hasBio, setHasBio] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [showAutolock, setShowAutolock] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBio(hw && enrolled);
      try { setSessions(await sessionsApi.list()); } catch {}
    })();
  }, []);

  const toggleBio = async (v: boolean) => {
    if (v) {
      if (!hasBio) {
        Alert.alert(
          "Biometrics unavailable",
          "This device or browser has no biometric hardware enrolled. On the web preview, biometric unlock is not supported — try on an iOS/Android device."
        );
        return;
      }
      // Authenticate FIRST before enabling — proves the user has permission
      try {
        const r = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm to enable biometric unlock",
          fallbackLabel: "Use master password",
        });
        if (!r.success) {
          Alert.alert("Not enabled", "Biometric authentication was not confirmed.");
          return;
        }
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to authenticate");
        return;
      }
      await setBiometricEnabled(true);
      Alert.alert("Enabled", "You can now unlock your vault with biometrics.");
    } else {
      await setBiometricEnabled(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await sessionsApi.revoke(id);
      setSessions((s) => s.filter((x) => x.session_id !== id));
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const doExport = async () => {
    const blob = await exportEncrypted();
    if (blob) {
      await Clipboard.setStringAsync(blob);
      setExported(blob);
      setTimeout(() => setExported(null), 3000);
    }
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.sub}>{user?.email}</Text>
        </View>

        <Section title="Security">
          <Row icon="lock" label="Lock now" onPress={lock} testID="settings-lock-now" />
          <RowSwitch
            icon="unlock"
            label="Unlock with biometrics"
            value={biometricEnabled}
            onChange={toggleBio}
            testID="settings-biometric"
          />
          <Row
            icon="clock"
            label="Auto-lock"
            valueText={AUTOLOCK_OPTIONS.find((o) => o.value === autolockMinutes)?.label || `${autolockMinutes}m`}
            onPress={() => setShowAutolock((s) => !s)}
            testID="settings-autolock"
          />
          {showAutolock && (
            <View style={styles.subGroup}>
              {AUTOLOCK_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={async () => { await setAutolock(o.value); setShowAutolock(false); }}
                  style={styles.subRow}
                  testID={`autolock-${o.value}`}
                >
                  <Text style={styles.subRowText}>{o.label}</Text>
                  {autolockMinutes === o.value && <Feather name="check" size={16} color={theme.color.brand} />}
                </Pressable>
              ))}
            </View>
          )}
        </Section>

        <Section title="Data">
          <Row
            icon="download"
            label="Export encrypted vault"
            valueText={exported ? "Copied" : undefined}
            onPress={doExport}
            testID="settings-export"
          />
          <Text style={styles.hint}>Export copies your encrypted vault to the clipboard. It stays useless without the master password.</Text>
        </Section>

        <Section title={`Sessions (${sessions.length})`}>
          {sessions.map((s) => (
            <View key={s.session_id} style={styles.sessionRow} testID={`session-${s.session_id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{s.device_name || "Device"}</Text>
                <Text style={styles.rowMeta}>Last used {new Date(s.last_used_at).toLocaleString()}</Text>
              </View>
              <Pressable onPress={() => revoke(s.session_id)} style={styles.revokeBtn} testID={`revoke-${s.session_id}`}>
                <Text style={styles.revokeText}>Revoke</Text>
              </Pressable>
            </View>
          ))}
          {sessions.length === 0 && <Text style={styles.hint}>No other active sessions.</Text>}
        </Section>

        <Section title="Account">
          <Row icon="log-out" label="Sign out" onPress={async () => { await logout(); router.replace("/auth"); }} testID="settings-signout" danger />
        </Section>

        <Text style={styles.footer}>
          SentinelPass · Zero-knowledge · End-to-end encrypted
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ icon, label, valueText, onPress, danger, testID }: any) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} testID={testID}>
      <Feather name={icon} size={18} color={danger ? theme.color.error : theme.color.onSurfaceSecondary} />
      <Text style={[styles.rowLabel, danger && { color: theme.color.error }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {valueText && <Text style={styles.rowValue}>{valueText}</Text>}
      <Feather name="chevron-right" size={16} color={theme.color.onSurfaceTertiary} />
    </Pressable>
  );
}

function RowSwitch({ icon, label, value, onChange, testID }: any) {
  return (
    <View style={styles.row} testID={testID}>
      <Feather name={icon} size={18} color={theme.color.onSurfaceSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.color.surfaceTertiary, true: theme.color.brand }} thumbColor="#F4F4F5" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  section: { marginTop: 24 },
  sectionTitle: {
    color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.8, marginLeft: 20, marginBottom: 8,
  },
  sectionBody: {
    marginHorizontal: 16, backgroundColor: theme.color.surfaceSecondary,
    borderRadius: 12, borderWidth: 1, borderColor: theme.color.border, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  rowLabel: { color: theme.color.onSurface, fontSize: 14 },
  rowValue: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginRight: 6 },
  rowMeta: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  hint: { color: theme.color.onSurfaceTertiary, fontSize: 12, padding: 14 },
  subGroup: { backgroundColor: theme.color.surface },
  subRow: {
    paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  subRowText: { color: theme.color.onSurface, fontSize: 13 },
  sessionRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  revokeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.color.surfaceTertiary, borderRadius: 8 },
  revokeText: { color: theme.color.error, fontWeight: "600", fontSize: 12 },
  footer: { color: theme.color.onSurfaceTertiary, fontSize: 11, textAlign: "center", marginTop: 32 },
});
