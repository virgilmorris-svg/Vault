import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { scorePassword } from "@/src/lib/passwords";
import { useLanguage, type Language } from "@/src/lib/i18n";

WebBrowser.maybeCompleteAuthSession();

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const router = useRouter();
  const vault = useVault();
  const { signup, login } = vault as any;
  const { t, language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [master, setMaster] = useState("");
  const [confirmMaster, setConfirmMaster] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const processedSessionId = React.useRef<Set<string>>(new Set());

  const processSessionId = async (sid: string) => {
    if (processedSessionId.current.has(sid)) return;
    processedSessionId.current.add(sid);
    setLoading(true);
    setErr(null);
    try {
      const user = await (vault as any).loginWithSessionId(sid);
      if (user?.kdf_salt) {
        router.replace("/lock");
      } else {
        router.replace("/google-setup");
      }
    } catch (e: any) {
      setErr(e.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  // Web: parse session_id from URL on mount
  useEffect(() => {
    if (Platform.OS !== "web") return;
    try {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const m = (hash + search).match(/session_id=([^&]+)/);
      if (m) {
        const sid = decodeURIComponent(m[1]);
        // Clean URL
        window.history.replaceState(window.history.state, "", window.location.pathname);
        processSessionId(sid);
      }
    } catch {}
  }, []);

  // Native: url listener + initial URL
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handle = (url: string | null) => {
      if (!url) return;
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      if (m) processSessionId(decodeURIComponent(m[1]));
    };
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    Linking.getInitialURL().then(handle);
    return () => sub.remove();
  }, []);

  const googleSignIn = async () => {
    setErr(null);
    try {
      const redirectUrl = Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        window.location.href = authUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        // Some Android flows return dismiss with no URL — url listener above will catch it
        if (result.type === "success" && result.url) {
          const m = result.url.match(/[?#&]session_id=([^&#]+)/);
          if (m) await processSessionId(decodeURIComponent(m[1]));
        }
      }
    } catch (e: any) {
      setErr(e.message || "Google sign-in failed");
    }
  };

  const strength = scorePassword(master);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!email || !pw || !master) throw new Error("Fill in all fields");
        if (master.length < 12) throw new Error("Master password must be at least 12 characters");
        if (master !== confirmMaster) throw new Error("Master passwords do not match");
        await signup(email, pw, master);
        router.replace("/(tabs)/vault");
      } else {
        if (!email || !pw) throw new Error("Fill in all fields");
        await login(email, pw);
        router.replace("/lock");
      }
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.color.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Image
            source={require("../assets/images/splash-image.png")}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
          <LinearGradient
            colors={["rgba(9,9,11,0.4)", "rgba(9,9,11,0.9)", theme.color.surface]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroContent}>
            <View style={styles.logo}>
              <Image
                source={require("../assets/images/icon.png")}
                style={{ width: 56, height: 56 }}
                contentFit="cover"
              />
            </View>
            <Text style={styles.brand}>VauLt</Text>
            <Text style={styles.tagline}>{t("zeroKnowledge")}</Text>
            <Text style={styles.credit}>Dev: V</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t("language")}</Text>
            {(["fr", "en", "es"] as Language[]).map((item) => (
              <Pressable key={item} onPress={() => setLanguage(item)} style={[styles.languageButton, language === item && styles.languageButtonActive]}>
                <Text style={[styles.languageText, language === item && styles.languageTextActive]}>{item.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.tabs} testID="auth-mode-tabs">
            <Pressable
              testID="tab-signin"
              onPress={() => setMode("signin")}
              style={[styles.tab, mode === "signin" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>{t("signIn")}</Text>
            </Pressable>
            <Pressable
              testID="tab-signup"
              onPress={() => setMode("signup")}
              style={[styles.tab, mode === "signup" && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>{t("createAccount")}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>{t("email")}</Text>
          <TextInput
            testID="auth-email"
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.color.onSurfaceTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>{t("accountPassword")}</Text>
          <View style={styles.inputRow}>
            <TextInput
              testID="auth-account-password"
              style={[styles.input, { flex: 1 }]}
              placeholder={t("atLeast8")}
              placeholderTextColor={theme.color.onSurfaceTertiary}
              secureTextEntry={!showPw}
              value={pw}
              onChangeText={setPw}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} style={styles.eye} testID="toggle-pw">
              <Feather name={showPw ? "eye-off" : "eye"} size={18} color={theme.color.onSurfaceTertiary} />
            </Pressable>
          </View>

          {mode === "signup" && (
            <>
              <Text style={styles.label}>{t("masterPassword")}</Text>
              <TextInput
                testID="auth-master"
                style={styles.input}
                placeholder={t("masterEncrypt")}
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
              <Text style={styles.label}>{t("confirmMaster")}</Text>
              <TextInput
                testID="auth-master-confirm"
                style={styles.input}
                placeholder={t("repeatMaster")}
                placeholderTextColor={theme.color.onSurfaceTertiary}
                secureTextEntry
                value={confirmMaster}
                onChangeText={setConfirmMaster}
              />
              <Text style={styles.notice}>
                {t("masterLocal")}
              </Text>
            </>
          )}

          {err && (
            <Text style={styles.error} testID="auth-error">{err}</Text>
          )}

          <Pressable
            testID="auth-submit"
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => [
              styles.cta,
              (pressed || loading) && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={theme.color.onBrand} />
            ) : (
              <Text style={styles.ctaText}>
                {mode === "signup" ? t("createVault") : t("signIn")}
              </Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            testID="auth-google"
            onPress={googleSignIn}
            style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="chrome" size={18} color={theme.color.onSurface} />
            <Text style={styles.googleText}>{t("signInWithGoogle")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260, position: "relative" },
  heroContent: { flex: 1, alignItems: "flex-start", justifyContent: "flex-end", padding: 24 },
  logo: {
    width: 56, height: 56, borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  brand: { color: theme.color.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  tagline: { color: theme.color.onSurfaceSecondary, fontSize: 14, marginTop: 4 },
  credit: { color: theme.color.brand, fontSize: 14, fontStyle: "italic", fontWeight: "700", marginTop: 8, letterSpacing: 0.5 },
  form: { padding: 24, paddingBottom: 48 },
  languageRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginBottom: 16 },
  languageLabel: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginRight: 4 },
  languageButton: { borderWidth: 1, borderColor: theme.color.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  languageButtonActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  languageText: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "700" },
  languageTextActive: { color: theme.color.onBrand },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: 12, padding: 4, marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: theme.color.surfaceTertiary },
  tabText: { color: theme.color.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: theme.color.onSurface },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: theme.color.onSurface, fontSize: 15,
  },
  inputRow: { flexDirection: "row", alignItems: "center", position: "relative" },
  eye: { position: "absolute", right: 12, height: 44, justifyContent: "center" },
  strengthRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceTertiary, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: "600" },
  notice: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 12, lineHeight: 18 },
  error: { color: theme.color.error, marginTop: 12, fontSize: 13 },
  cta: {
    marginTop: 24,
    backgroundColor: theme.color.brand,
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
  },
  ctaText: { color: theme.color.onBrand, fontSize: 16, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", marginTop: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.color.border },
  dividerText: { color: theme.color.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  googleBtn: {
    marginTop: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
  },
  googleText: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600" },
});
