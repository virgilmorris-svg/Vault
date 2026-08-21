import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList, ScrollView, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVault, VaultCategory, VaultEntry } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";

const CATS: { key: "all" | VaultCategory; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: "grid" },
  { key: "login", label: "Logins", icon: "key" },
  { key: "card", label: "Cards", icon: "credit-card" },
  { key: "identity", label: "Identity", icon: "user" },
  { key: "note", label: "Notes", icon: "file-text" },
];

export default function VaultScreen() {
  const router = useRouter();
  const { vault, sync } = useVault();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | VaultCategory>("all");
  const [refreshing, setRefreshing] = useState(false);

  const entries = vault?.entries || [];

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (cat !== "all" && e.category !== cat) return false;
      if (query) {
        const q = query.toLowerCase();
        if (
          !e.title.toLowerCase().includes(q) &&
          !(e.username || "").toLowerCase().includes(q) &&
          !(e.url || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [entries, query, cat]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await sync(); } catch {}
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault</Text>
        <Text style={styles.count}>{entries.length} items</Text>
      </View>

      <View style={styles.searchWrap}>
        <Feather name="search" size={16} color={theme.color.onSurfaceTertiary} style={{ marginLeft: 12 }} />
        <TextInput
          testID="vault-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search vault…"
          placeholderTextColor={theme.color.onSurfaceTertiary}
          style={styles.search}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={styles.chipsContent}
      >
        {CATS.map((c) => {
          const active = cat === c.key;
          return (
            <Pressable
              key={c.key}
              testID={`chip-${c.key}`}
              onPress={() => setCat(c.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Feather
                name={c.icon}
                size={14}
                color={active ? theme.color.brand : theme.color.onSurfaceTertiary}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.brand} />}
        ListEmptyComponent={
          <View style={styles.empty} testID="vault-empty">
            <Feather name="inbox" size={40} color={theme.color.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Your vault is empty</Text>
            <Text style={styles.emptySub}>Tap the + button to add your first credential</Text>
          </View>
        }
        renderItem={({ item }) => <EntryRow entry={item} onPress={() => router.push(`/entry/${item.id}`)} />}
      />

      <Pressable
        testID="add-entry-fab"
        onPress={() => router.push("/entry/new")}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Feather name="plus" size={26} color={theme.color.onBrand} />
      </Pressable>
    </SafeAreaView>
  );
}

function EntryRow({ entry, onPress }: { entry: VaultEntry; onPress: () => void }) {
  const initial = (entry.title || "?").slice(0, 1).toUpperCase();
  const iconName: any =
    entry.category === "login" ? "key" :
    entry.category === "card" ? "credit-card" :
    entry.category === "identity" ? "user" : "file-text";
  return (
    <Pressable
      testID={`entry-row-${entry.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.color.surfaceTertiary }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{entry.title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{entry.username || entry.url || entry.category}</Text>
      </View>
      <Feather name={iconName} size={16} color={theme.color.onSurfaceTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { color: theme.color.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  count: { color: theme.color.onSurfaceTertiary, fontSize: 13 },
  searchWrap: {
    marginHorizontal: 16, marginTop: 8, marginBottom: 8,
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 12,
    borderWidth: 1, borderColor: theme.color.border,
  },
  search: { flex: 1, height: 42, color: theme.color.onSurface, paddingHorizontal: 10, fontSize: 14 },
  chipsRow: { maxHeight: 56, marginBottom: 4 },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: "center", height: 56 },
  chip: {
    flexShrink: 0,
    height: 36, paddingHorizontal: 14, borderRadius: 999,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brand },
  chipText: { color: theme.color.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: theme.color.brand },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8,
    backgroundColor: theme.color.surfaceSecondary, borderRadius: 12,
    borderWidth: 1, borderColor: theme.color.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: theme.color.brand, fontSize: 16, fontWeight: "700" },
  rowTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600" },
  rowSub: { color: theme.color.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 8 },
  emptyTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700", marginTop: 8 },
  emptySub: { color: theme.color.onSurfaceTertiary, fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  fab: {
    position: "absolute", right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: theme.color.brand,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
