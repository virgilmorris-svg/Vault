import { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { scorePassword } from "@/src/lib/passwords";
import { checkPassword } from "@/src/lib/breach";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function SecurityScreen() {
  const { vault } = useVault();
  const router = useRouter();
  const entries = vault?.entries || [];
  const logins = entries.filter((e) => e.category === "login" && e.password);
  const [breaches, setBreaches] = useState<Record<string, number>>({});
  const [scanning, setScanning] = useState(false);

  const scanBreaches = async () => {
    if (scanning || logins.length === 0) return;
    setScanning(true);
    const results: Record<string, number> = {};
    for (const l of logins) {
      try {
        const c = await checkPassword(l.password!);
        results[l.id] = c;
      } catch {
        results[l.id] = 0;
      }
    }
    setBreaches(results);
    setScanning(false);
  };

  useEffect(() => {
    // auto-scan on first mount if we have logins
    if (logins.length > 0 && Object.keys(breaches).length === 0) scanBreaches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logins.length]);

  const analysis = useMemo(() => {
    const weak: typeof logins = [];
    const reused: typeof logins = [];
    const old: typeof logins = [];
    const breached: typeof logins = [];
    const pwCount: Record<string, number> = {};
    logins.forEach((e) => {
      pwCount[e.password!] = (pwCount[e.password!] || 0) + 1;
    });
    logins.forEach((e) => {
      const s = scorePassword(e.password!);
      if (s.score < 60) weak.push(e);
      if (pwCount[e.password!] > 1) reused.push(e);
      const ageDays = (Date.now() - new Date(e.updated_at).getTime()) / DAY_MS;
      if (ageDays > 365) old.push(e);
      if ((breaches[e.id] || 0) > 0) breached.push(e);
    });
    let score = 100;
    if (logins.length) {
      score -= Math.round((weak.length / logins.length) * 30);
      score -= Math.round((reused.length / logins.length) * 25);
      score -= Math.round((old.length / logins.length) * 15);
      score -= Math.round((breached.length / logins.length) * 40);
    }
    score = Math.max(0, Math.min(100, score));
    const color = score >= 80 ? theme.color.success : score >= 50 ? theme.color.warning : theme.color.error;
    const status = score >= 80 ? "Excellent" : score >= 50 ? "Needs attention" : "At risk";
    return { weak, reused, old, breached, score, color, status };
  }, [logins, breaches]);

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Security</Text>
          <Text style={styles.sub}>Vault health & recommendations</Text>
        </View>

        <View style={styles.scoreCard} testID="security-score-card">
          <View style={[styles.ring, { borderColor: analysis.color }]}>
            <Text style={[styles.scoreValue, { color: analysis.color }]}>{analysis.score}</Text>
            <Text style={styles.scoreOutOf}>/ 100</Text>
          </View>
          <Text style={styles.scoreStatus}>{analysis.status}</Text>
          <Text style={styles.scoreMeta}>{logins.length} login credentials analyzed</Text>
          <Pressable onPress={scanBreaches} disabled={scanning || logins.length === 0} style={styles.rescanBtn} testID="security-rescan">
            {scanning ? <ActivityIndicator size="small" color={theme.color.brand} /> : <Feather name="refresh-cw" size={14} color={theme.color.brand} />}
            <Text style={styles.rescanText}>{scanning ? "Checking breaches…" : "Recheck breaches"}</Text>
          </Pressable>
        </View>

        <IssueCard
          testID="issue-breached"
          icon="alert-octagon"
          title="Breached passwords"
          desc="Found in known data breaches. Change these immediately."
          count={analysis.breached.length}
          color={theme.color.error}
          entries={analysis.breached.map((e) => ({ ...e, meta: `${breaches[e.id]?.toLocaleString?.() || 0} occurrences` }))}
          onEntry={(id) => router.push(`/entry/${id}`)}
        />

        <IssueCard
          testID="issue-weak"
          icon="alert-triangle"
          title="Weak passwords"
          desc="Passwords that are too short or lack complexity."
          count={analysis.weak.length}
          color={theme.color.error}
          entries={analysis.weak}
          onEntry={(id) => router.push(`/entry/${id}`)}
        />
        <IssueCard
          testID="issue-reused"
          icon="copy"
          title="Reused passwords"
          desc="The same password is used across multiple accounts."
          count={analysis.reused.length}
          color={theme.color.warning}
          entries={analysis.reused}
          onEntry={(id) => router.push(`/entry/${id}`)}
        />
        <IssueCard
          testID="issue-old"
          icon="clock"
          title="Aging passwords"
          desc="Not updated in the last 12 months."
          count={analysis.old.length}
          color={theme.color.info}
          entries={analysis.old}
          onEntry={(id) => router.push(`/entry/${id}`)}
        />

        {logins.length === 0 && (
          <View style={styles.empty} testID="security-empty">
            <Feather name="shield" size={40} color={theme.color.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>No logins yet</Text>
            <Text style={styles.emptySub}>Add login credentials to see security insights</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function IssueCard({
  icon, title, desc, count, color, entries, onEntry, testID,
}: {
  icon: any; title: string; desc: string; count: number; color: string;
  entries: any[]; onEntry: (id: string) => void; testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: color + "22", borderColor: color + "55" }]}>
          <Feather name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDesc}>{desc}</Text>
        </View>
        <Text style={[styles.cardCount, { color }]}>{count}</Text>
      </View>
      {entries.slice(0, 3).map((e) => (
        <Pressable key={e.id} onPress={() => onEntry(e.id)} style={styles.cardEntry} testID={`issue-entry-${e.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardEntryTitle} numberOfLines={1}>{e.title}</Text>
            {e.meta && <Text style={styles.cardEntryMeta} numberOfLines={1}>{e.meta}</Text>}
          </View>
          <Feather name="chevron-right" size={14} color={theme.color.onSurfaceTertiary} />
        </Pressable>
      ))}
      {entries.length > 3 && (
        <Text style={styles.moreText}>+ {entries.length - 3} more</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.color.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  scoreCard: {
    margin: 16, padding: 24, alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 16,
    borderWidth: 1, borderColor: theme.color.border,
  },
  ring: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 8,
    alignItems: "center", justifyContent: "center",
  },
  scoreValue: { fontSize: 42, fontWeight: "800" },
  scoreOutOf: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: -4 },
  scoreStatus: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginTop: 16 },
  scoreMeta: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  card: {
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 12,
    borderWidth: 1, borderColor: theme.color.border,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "700" },
  cardDesc: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  cardCount: { fontSize: 22, fontWeight: "800" },
  cardEntry: {
    marginTop: 8, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: theme.color.surfaceTertiary, borderRadius: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  cardEntryTitle: { color: theme.color.onSurface, fontSize: 13, flex: 1 },
  cardEntryMeta: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  rescanBtn: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.color.surfaceTertiary },
  rescanText: { color: theme.color.brand, fontSize: 12, fontWeight: "600" },
  moreText: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 8, marginLeft: 10 },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700", marginTop: 8 },
  emptySub: { color: theme.color.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
});
