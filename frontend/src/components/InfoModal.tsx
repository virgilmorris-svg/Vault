// Simple, reliable in-app modal (replaces Alert.alert which is inconsistent on web)
import React from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";

type Kind = "success" | "error" | "info";

export function InfoModal({
  visible, title, message, kind = "info", onClose, ctaText = "OK",
}: { visible: boolean; title: string; message: string; kind?: Kind; onClose: () => void; ctaText?: string }) {
  const color = kind === "success" ? theme.color.success : kind === "error" ? theme.color.error : theme.color.brand;
  const icon = kind === "success" ? "check-circle" : kind === "error" ? "alert-triangle" : "info";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <Feather name={icon as any} size={28} color={color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.msg}>{message}</Text>
          <Pressable onPress={onClose} style={[styles.cta, { backgroundColor: color }]} testID="info-modal-ok">
            <Text style={styles.ctaText}>{ctaText}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%", maxWidth: 380, backgroundColor: theme.color.surfaceSecondary,
    borderRadius: 20, padding: 24, alignItems: "center",
    borderWidth: 1, borderColor: theme.color.border,
  },
  iconWrap: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800", textAlign: "center" },
  msg: { color: theme.color.onSurfaceTertiary, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20 },
  cta: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, minWidth: 120, alignItems: "center" },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
});
