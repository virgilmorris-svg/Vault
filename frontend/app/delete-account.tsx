import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { useLanguage } from "@/src/lib/i18n";
import { InfoModal } from "@/src/components/InfoModal";

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, keys, deleteAccount, exportEncrypted } = useVault();
  const { t } = useLanguage();
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [exported, setExported] = useState(false);
  const [info, setInfo] = useState<{ title: string; message: string; kind: "success" | "error" } | null>(null);

  const doExport = async () => {
    if (!keys) {
      setInfo({ title: t("exportVault"), message: t("exportNeedsUnlock"), kind: "error" });
      return;
    }
    try {
      const blob = await exportEncrypted();
      if (blob) {
        await Clipboard.setStringAsync(blob);
        setExported(true);
        setInfo({ title: t("exportCopied"), message: t("exportCopiedMsg"), kind: "success" });
      }
    } catch (e: any) {
      setInfo({ title: t("exportVault"), message: e?.message || "Export failed", kind: "error" });
    }
  };

  const needsPassword = user?.provider !== "google";
  const email: string = (user?.email || "").toLowerCase();
  const emailMatches = confirmation.trim().toLowerCase() === email && email.length > 0;
  const canSubmit = emailMatches && (!needsPassword || password.length > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(confirmation.trim(), needsPassword ? password : undefined);
      setDone(true);
    } catch (e: any) {
      setError(e?.message || "Deletion failed");
    } finally {
      setBusy(false);
    }
  };

  const items = [t("deleteItemAccount"), t("deleteItemVault"), t("deleteItemFiles"), t("deleteItemSessions")];

  return (
    <SafeAreaView style={styles.c} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12} testID="delete-account-back">
            <Feather name="arrow-left" size={22} color={theme.color.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("deleteAccountTitle")}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.warnCard} testID="delete-account-warning">
            <View style={styles.warnIcon}>
              <Feather name="alert-triangle" size={26} color={theme.color.error} />
            </View>
            <Text style={styles.warnTitle}>{t("deleteAccountIrreversible")}</Text>
            <Text style={styles.warnBody}>{t("deleteAccountWhat")}</Text>
            {items.map((it) => (
              <View key={it} style={styles.itemRow}>
                <Feather name="x-circle" size={14} color={theme.color.error} />
                <Text style={styles.itemText}>{it}</Text>
              </View>
            ))}
            <Text style={styles.noRecovery}>{t("deleteAccountNoRecovery")}</Text>
          </View>

          <Pressable
            testID="delete-account-export"
            onPress={doExport}
            style={({ pressed }) => [styles.exportBtn, exported && styles.exportBtnDone, pressed && { opacity: 0.8 }]}
          >
            <Feather name={exported ? "check-circle" : "download"} size={18} color={exported ? theme.color.success : theme.color.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.exportTitle, exported && { color: theme.color.success }]}>{exported ? t("exportCopied") : t("exportVault")}</Text>
              <Text style={styles.exportHint}>{t("exportVaultHint")}</Text>
            </View>
          </Pressable>

          <Text style={styles.label}>{t("typeEmailToConfirm")}</Text>
          <TextInput
            testID="delete-account-email"
            style={styles.input}
            placeholder={email}
            placeholderTextColor={theme.color.onSurfaceTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={confirmation}
            onChangeText={setConfirmation}
          />
          {confirmation.length > 0 && !emailMatches && !done && <Text style={styles.fieldError}>{t("emailMismatch")}</Text>}

          {needsPassword && (
            <>
              <Text style={styles.label}>{t("enterAccountPassword")}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  testID="delete-account-password"
                  style={[styles.input, { flex: 1, paddingRight: 44 }]}
                  placeholder="••••••••"
                  placeholderTextColor={theme.color.onSurfaceTertiary}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPw((s) => !s)} style={styles.eye} hitSlop={8}>
                  <Feather name={showPw ? "eye-off" : "eye"} size={18} color={theme.color.onSurfaceTertiary} />
                </Pressable>
              </View>
            </>
          )}

          {error && (
            <View style={styles.errorBox} testID="delete-account-error">
              <Feather name="alert-circle" size={16} color={theme.color.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            testID="delete-account-submit"
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [styles.deleteBtn, !canSubmit && { opacity: 0.4 }, pressed && canSubmit && { opacity: 0.8 }]}
          >
            {busy ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <>
                <Feather name="trash-2" size={18} color="#FFFFFF" />
                <Text style={styles.deleteBtnText}>{t("deletePermanently")}</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancelBtn} disabled={busy} testID="delete-account-cancel">
            <Text style={styles.cancelText}>{t("cancel")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <InfoModal
        visible={!!info}
        title={info?.title || ""}
        message={info?.message || ""}
        kind={info?.kind || "info"}
        onClose={() => setInfo(null)}
      />

      <InfoModal
        visible={done}
        title={t("accountDeleted")}
        message={t("accountDeletedMsg")}
        kind="success"
        onClose={() => { setDone(false); router.replace("/auth"); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: theme.color.onSurface, fontSize: 20, fontWeight: "800", flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  warnCard: {
    backgroundColor: theme.color.error + "14", borderWidth: 1, borderColor: theme.color.error + "55",
    borderRadius: 16, padding: 18, marginTop: 8,
  },
  warnIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color.error + "22",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  warnTitle: { color: theme.color.onSurface, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  warnBody: { color: theme.color.onSurfaceSecondary, fontSize: 14, marginBottom: 10 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  itemText: { color: theme.color.onSurface, fontSize: 14, flex: 1 },
  noRecovery: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 12, lineHeight: 17 },
  exportBtn: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16,
    backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.brand + "66",
    borderRadius: 14, padding: 14, minHeight: 56,
  },
  exportBtnDone: { borderColor: theme.color.success + "66" },
  exportTitle: { color: theme.color.brand, fontSize: 15, fontWeight: "700" },
  exportHint: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "600", marginTop: 20, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: theme.color.onSurface, fontSize: 15,
  },
  inputRow: { flexDirection: "row", alignItems: "center", position: "relative" },
  eye: { position: "absolute", right: 12, height: 44, justifyContent: "center" },
  fieldError: { color: theme.color.error, fontSize: 12, marginTop: 6 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16,
    backgroundColor: theme.color.error + "14", borderRadius: 10, padding: 12,
  },
  errorText: { color: theme.color.error, fontSize: 13, flex: 1 },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: theme.color.error, borderRadius: 12, paddingVertical: 16, marginTop: 24, minHeight: 52,
  },
  deleteBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cancelBtn: { alignItems: "center", paddingVertical: 16, marginTop: 4, minHeight: 48 },
  cancelText: { color: theme.color.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
});
