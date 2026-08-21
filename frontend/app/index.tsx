import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useVault } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";

export default function Index() {
  const router = useRouter();
  const { authed, unlocked, loading } = useVault();

  useEffect(() => {
    if (loading) return;
    if (!authed) router.replace("/auth");
    else if (!unlocked) router.replace("/lock");
    else router.replace("/(tabs)/vault");
  }, [authed, unlocked, loading]);

  return (
    <View style={styles.c} testID="root-loading">
      <ActivityIndicator color={theme.color.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" },
});
