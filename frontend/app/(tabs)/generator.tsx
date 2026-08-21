import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/src/lib/theme";
import { generatePassword, generatePassphrase, scorePassword, GenOpts } from "@/src/lib/passwords";

type Mode = "password" | "passphrase";

export default function GeneratorScreen() {
  const [mode, setMode] = useState<Mode>("password");
  const [opts, setOpts] = useState<GenOpts>({
    length: 20, upper: true, lower: true, digits: true, symbols: true, avoidAmbiguous: true,
  });
  const [words, setWords] = useState(4);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  const regen = () => {
    if (mode === "password") setValue(generatePassword(opts));
    else setValue(generatePassphrase(words));
  };

  useEffect(() => { regen(); /* eslint-disable-next-line */ }, [mode, opts, words]);

  const strength = useMemo(() => scorePassword(value), [value]);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Generator</Text>
          <Text style={styles.sub}>Create strong, unique passwords</Text>
        </View>

        <View style={styles.modeTabs}>
          <Pressable
            testID="gen-mode-password"
            onPress={() => setMode("password")}
            style={[styles.modeTab, mode === "password" && styles.modeTabActive]}
          >
            <Text style={[styles.modeText, mode === "password" && styles.modeTextActive]}>Password</Text>
          </Pressable>
          <Pressable
            testID="gen-mode-passphrase"
            onPress={() => setMode("passphrase")}
            style={[styles.modeTab, mode === "passphrase" && styles.modeTabActive]}
          >
            <Text style={[styles.modeText, mode === "passphrase" && styles.modeTextActive]}>Passphrase</Text>
          </Pressable>
        </View>

        <View style={styles.display} testID="gen-output-box">
          <Text style={styles.display_pw} selectable numberOfLines={3}>
            {value}
          </Text>
          <View style={styles.strengthRow}>
            <View style={styles.strengthBar}>
              <View style={[styles.strengthFill, { width: `${strength.score}%`, backgroundColor: strength.color }]} />
            </View>
            <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
          </View>
          <View style={styles.displayActions}>
            <Pressable onPress={regen} style={styles.iconBtn} testID="gen-regenerate">
              <Feather name="refresh-cw" size={18} color={theme.color.onSurface} />
              <Text style={styles.iconBtnText}>Regenerate</Text>
            </Pressable>
            <Pressable onPress={copy} style={[styles.iconBtn, styles.iconBtnPrimary]} testID="gen-copy">
              <Feather name={copied ? "check" : "copy"} size={18} color={theme.color.onBrand} />
              <Text style={[styles.iconBtnText, { color: theme.color.onBrand }]}>{copied ? "Copied" : "Copy"}</Text>
            </Pressable>
          </View>
        </View>

        {mode === "password" ? (
          <View style={styles.opts}>
            <View style={styles.optRow}>
              <Text style={styles.optLabel}>Length</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => setOpts({ ...opts, length: Math.max(8, opts.length - 1) })} style={styles.stepBtn} testID="len-minus">
                  <Feather name="minus" size={16} color={theme.color.onSurface} />
                </Pressable>
                <Text style={styles.stepValue} testID="len-value">{opts.length}</Text>
                <Pressable onPress={() => setOpts({ ...opts, length: Math.min(64, opts.length + 1) })} style={styles.stepBtn} testID="len-plus">
                  <Feather name="plus" size={16} color={theme.color.onSurface} />
                </Pressable>
              </View>
            </View>
            <Toggle label="Uppercase (A–Z)" value={opts.upper} onChange={(v) => setOpts({ ...opts, upper: v })} testID="opt-upper" />
            <Toggle label="Lowercase (a–z)" value={opts.lower} onChange={(v) => setOpts({ ...opts, lower: v })} testID="opt-lower" />
            <Toggle label="Digits (0–9)" value={opts.digits} onChange={(v) => setOpts({ ...opts, digits: v })} testID="opt-digits" />
            <Toggle label="Symbols (!@#…)" value={opts.symbols} onChange={(v) => setOpts({ ...opts, symbols: v })} testID="opt-symbols" />
            <Toggle label="Avoid ambiguous (l,1,O,0)" value={opts.avoidAmbiguous} onChange={(v) => setOpts({ ...opts, avoidAmbiguous: v })} testID="opt-ambig" />
          </View>
        ) : (
          <View style={styles.opts}>
            <View style={styles.optRow}>
              <Text style={styles.optLabel}>Number of words</Text>
              <View style={styles.stepper}>
                <Pressable onPress={() => setWords(Math.max(3, words - 1))} style={styles.stepBtn} testID="words-minus">
                  <Feather name="minus" size={16} color={theme.color.onSurface} />
                </Pressable>
                <Text style={styles.stepValue} testID="words-value">{words}</Text>
                <Pressable onPress={() => setWords(Math.min(10, words + 1))} style={styles.stepBtn} testID="words-plus">
                  <Feather name="plus" size={16} color={theme.color.onSurface} />
                </Pressable>
              </View>
            </View>
            <Text style={styles.tip}>Memorable and long. Great for master passwords.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.optRow} testID={testID}>
      <Text style={styles.optLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.color.surfaceTertiary, true: theme.color.brand }}
        thumbColor={"#F4F4F5"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  modeTabs: {
    marginHorizontal: 16, marginTop: 16,
    flexDirection: "row", backgroundColor: theme.color.surfaceSecondary,
    borderRadius: 12, padding: 4,
  },
  modeTab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  modeTabActive: { backgroundColor: theme.color.surfaceTertiary },
  modeText: { color: theme.color.onSurfaceTertiary, fontWeight: "600", fontSize: 13 },
  modeTextActive: { color: theme.color.onSurface },
  display: {
    marginHorizontal: 16, marginTop: 16, padding: 16,
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 16,
    borderWidth: 1, borderColor: theme.color.border,
  },
  display_pw: {
    color: theme.color.brand, fontSize: 22, fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    letterSpacing: 1, textAlign: "center", marginVertical: 8, minHeight: 60,
  },
  strengthRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceTertiary, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontWeight: "600" },
  displayActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  iconBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 12, backgroundColor: theme.color.surfaceTertiary, borderRadius: 10,
  },
  iconBtnPrimary: { backgroundColor: theme.color.brand },
  iconBtnText: { color: theme.color.onSurface, fontSize: 14, fontWeight: "600" },
  opts: { marginHorizontal: 16, marginTop: 16, padding: 8, backgroundColor: theme.color.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: theme.color.border },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  optLabel: { color: theme.color.onSurface, fontSize: 14 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.color.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  stepValue: { color: theme.color.onSurface, fontWeight: "700", width: 32, textAlign: "center", fontSize: 15 },
  tip: { color: theme.color.onSurfaceTertiary, fontSize: 12, padding: 12 },
});
