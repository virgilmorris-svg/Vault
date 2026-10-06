import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert, Share, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { sessionsApi } from "@/src/lib/api";
import { InfoModal } from "@/src/components/InfoModal";
import { useLanguage, type Language } from "@/src/lib/i18n";

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
  const { user, autolockMinutes, setAutolock, biometricEnabled, setBiometricEnabled, lock, logout, exportEncrypted, keys } = vault as any;
  const { t, language, setLanguage } = useLanguage();
  const [hasBio, setHasBio] = useState(false);
  const [bioTypes, setBioTypes] = useState<string>("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [showAutolock, setShowAutolock] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [modal, setModal] = useState<{ visible: boolean; title: string; message: string; kind: "success" | "error" | "info" }>({ visible: false, title: "", message: "", kind: "info" });
  const [bioBusy, setBioBusy] = useState(false);

  const showModal = (title: string, message: string, kind: "success" | "error" | "info" = "info") =>
    setModal({ visible: true, title, message, kind });

  useEffect(() => {
    (async () => {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBio(hw && enrolled);
      try {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        const labels: string[] = [];
        for (const t of types) {
          if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) labels.push("Face ID");
          else if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) labels.push("Fingerprint");
          else if (t === LocalAuthentication.AuthenticationType.IRIS) labels.push("Iris");
        }
        setBioTypes(labels.join(" · ") || (hw ? "Available" : "Unavailable"));
      } catch {}
      try { setSessions(await sessionsApi.list()); } catch {}
    })();
  }, []);

  const enableBiometric = async () => {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      if (Platform.OS === "web") {
        showModal(
          "Not available in browser",
          "Biometric unlock requires a real iOS or Android device. Scan the QR code from the preview to test in Expo Go, or generate a build to use Face ID / fingerprint.",
          "info"
        );
        return;
      }
      const hw = await LocalAuthentication.hasHardwareAsync();
      if (!hw) {
        showModal("No biometric hardware", "This device has no fingerprint or facial recognition sensor.", "error");
        return;
      }
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        showModal(
          "No biometrics enrolled",
          "Add a fingerprint or Face ID in your device settings, then come back to enable biometric unlock.",
          "error"
        );
        return;
      }
      if (!keys) {
        showModal("Vault locked", "Please unlock the vault first, then try again.", "error");
        return;
      }
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm to enable biometric unlock for VauLt",
        fallbackLabel: "Cancel",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      if (!r.success) {
        showModal("Not enabled", `Biometric authentication was not confirmed${(r as any).error ? ` (${(r as any).error})` : ""}.`, "error");
        return;
      }
      await setBiometricEnabled(true);
      showModal("Biometric unlock enabled", "You can now unlock your vault with " + (bioTypes || "biometrics") + ".", "success");
    } catch (e: any) {
      showModal("Error", e?.message || "Failed to enable biometrics", "error");
    } finally {
      setBioBusy(false);
    }
  };

  const disableBiometric = async () => {
    await setBiometricEnabled(false);
    showModal("Biometric unlock disabled", "You'll need your master password to unlock the vault.", "info");
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

  const inviteFriends = async () => {
    const appUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "https://vault.emergent.host";
    const message = `Try VauLt — a zero-knowledge password manager. Each account stays private and end-to-end encrypted. ${appUrl}`;
    try {
      if (Platform.OS === "web") {
        // @ts-ignore
        if (navigator.share) {
          // @ts-ignore
          await navigator.share({ title: "VauLt", text: message, url: appUrl });
        } else {
          await Clipboard.setStringAsync(message);
          Alert.alert("Invite copied", "Share link copied to clipboard.");
        }
      } else {
        await Share.share({ message, url: appUrl, title: "VauLt" });
      }
    } catch (e: any) {
      // user dismissed
    }
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("settings")}</Text>
          <Text style={styles.sub}>{user?.email}</Text>
        </View>

        <Section title={t("language")}>
          <View style={styles.languageRow}>
            {(["fr", "en", "es"] as Language[]).map((item) => (
              <Pressable key={item} onPress={() => setLanguage(item)} style={[styles.languageButton, language === item && styles.languageButtonActive]}>
                <Text style={[styles.languageText, language === item && styles.languageTextActive]}>{item === "fr" ? t("french") : item === "en" ? t("english") : t("spanish")}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title={t("security")}>
          <Row icon="lock" label={t("lockNow")} onPress={() => { lock(); router.replace("/lock"); }} testID="settings-lock-now" />
          <View style={styles.bioCard} testID="settings-biometric">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.bioIcon, { borderColor: biometricEnabled ? theme.color.success : theme.color.border, backgroundColor: (biometricEnabled ? theme.color.success : theme.color.brand) + "22" }]}>
                <Feather name={biometricEnabled ? "check" : "unlock"} size={18} color={biometricEnabled ? theme.color.success : theme.color.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bioLabel}>{t("biometric")}</Text>
                <Text style={styles.bioStatus}>
                  {Platform.OS === "web"
                    ? "Not available in browser preview"
                    : biometricEnabled
                    ? `Enabled · ${bioTypes || "biometric"}`
                    : hasBio
                    ? `Available · ${bioTypes}`
                    : "No biometrics enrolled on this device"}
                </Text>
              </View>
            </View>
            <Pressable
              testID="biometric-action-btn"
              onPress={biometricEnabled ? disableBiometric : enableBiometric}
              disabled={bioBusy}
              style={({ pressed }) => [
                styles.bioBtn,
                { backgroundColor: biometricEnabled ? theme.color.surfaceTertiary : theme.color.brand },
                (pressed || bioBusy) && { opacity: 0.75 },
              ]}
            >
              <Text style={[styles.bioBtnText, { color: biometricEnabled ? theme.color.error : theme.color.onBrand }]}>
                {bioBusy ? "…" : biometricEnabled ? t("disable") : t("enable")}
              </Text>
            </Pressable>
          </View>
          <Row
            icon="clock"
            label={t("autoLock")}
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

        <Section title="Share">
          <Row icon="share-2" label="Invite friends & family" onPress={inviteFriends} testID="settings-invite" />
          <Text style={styles.hint}>Each person gets their own private, end-to-end encrypted vault. Accounts are fully isolated.</Text>
        </Section>

        <Section title="Quick Copy">
          <Row icon="zap" label="Open Quick Copy" onPress={() => router.push("/quick-copy")} testID="settings-quickcopy" />
          <Text style={styles.hint}>
            Quick Copy is a biometric-gated fast surface: unlock once, tap a login to copy its password instantly. A home-screen widget with the same UX will be available on iOS/Android after you publish and generate a native build (Expo Go doesn't support widgets).
          </Text>
        </Section>

        <Section title="Guides">
          <Row icon="video" label="Secure your Wi-Fi camera" onPress={() => router.push("/camera-guide")} testID="settings-camera-guide" />
          <Text style={styles.hint}>Step-by-step guide to block a cheap Wi-Fi camera (A9-type) from phoning home to its manufacturer's cloud, while keeping it usable locally.</Text>
          <Row icon="wifi" label="A9 camera (local viewer)" onPress={() => router.push("/a9-camera")} testID="settings-a9-camera" />
          <Text style={styles.hint}>Experimental: discover and view an A9 / mini Wi-Fi camera on your LAN without going through the manufacturer cloud. Requires a native Android build.</Text>
        </Section>

        <Section title="Home-Screen Widget & Autofill">
          <View style={styles.extInfo} testID="extensions-info">
            <View style={styles.extRow}>
              <Feather name="grid" size={16} color={theme.color.brand} />
              <Text style={styles.extLabel}>Home-screen widget</Text>
              <Text style={styles.extStatus}>Requires build</Text>
            </View>
            <View style={styles.extRow}>
              <Feather name="edit-3" size={16} color={theme.color.brand} />
              <Text style={styles.extLabel}>System autofill provider</Text>
              <Text style={styles.extStatus}>Requires build</Text>
            </View>
            <Text style={styles.hint}>
              Both features are scaffolded and will be included in your next native build. To activate:{"\n\n"}
              1. Tap Publish (top-right){"\n"}
              2. Generate iOS and/or Android build{"\n"}
              3. Install on your device{"\n\n"}
              On iOS: long-press home screen → Add Widget → VauLt. For autofill: Settings → Passwords → AutoFill Passwords → enable VauLt.{"\n\n"}
              On Android: long-press home screen → Widgets → VauLt. For autofill: Settings → System → Languages & input → Autofill service → VauLt.
            </Text>
          </View>
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
          VauLt · Zero-knowledge · End-to-end encrypted{"\n"}Made by V.
        </Text>
      </ScrollView>

      <InfoModal
        visible={modal.visible}
        title={modal.title}
        message={modal.message}
        kind={modal.kind}
        onClose={() => setModal((m) => ({ ...m, visible: false }))}
      />
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
  languageRow: { flexDirection: "row", gap: 8, padding: 14 },
  languageButton: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: theme.color.border, borderRadius: 8, paddingVertical: 10 },
  languageButtonActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  languageText: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  languageTextActive: { color: theme.color.onBrand },
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
  bioCard: {
    padding: 14, borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  bioIcon: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bioLabel: { color: theme.color.onSurface, fontSize: 14, fontWeight: "700" },
  bioStatus: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  bioBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  bioBtnText: { fontSize: 14, fontWeight: "700" },
  extInfo: { padding: 14 },
  extRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  extLabel: { color: theme.color.onSurface, fontSize: 14, flex: 1 },
  extStatus: {
    color: theme.color.warning, fontSize: 11, fontWeight: "700",
    backgroundColor: theme.color.warning + "22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
});
