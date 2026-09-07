// Static in-app guide: how to block the A9 camera from reaching the internet.
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { theme } from "@/src/lib/theme";

export default function CameraGuideScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="guide-back">
          <Feather name="chevron-left" size={22} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>Secure your A9 camera</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={18} color={theme.color.error} />
          <Text style={styles.warnText}>
            Your A9 camera has known vulnerabilities (CVE-2019-11220 / iLnkP2P). Its stream can leak
            through the manufacturer's cloud. These steps let you keep using it locally while cutting
            off external access.
          </Text>
        </View>

        <Step n={1} title="Find the camera on your Wi-Fi">
          Open your router's admin page (usually http://192.168.1.1 or http://192.168.0.1). Log in.
          Look for a list called "Connected Devices" / "DHCP Clients" / "Attached Devices".
          The A9 shows up as a device whose name starts with DGO, JXLCAM, or a random MAC starting
          with 68:57:2D, 7C:A7:B0 or similar. Note its IP and MAC address.
        </Step>

        <Step n={2} title="Give it a fixed IP (DHCP reservation)">
          In the router: DHCP → Address Reservation → add a new entry mapping the camera's MAC to a
          fixed local IP (e.g. 192.168.1.50). This ensures the block rule below never expires.
        </Step>

        <Step n={3} title="Block its internet access">
          Look in the router for one of these features (name varies by brand):
          - "Access Control" / "Parental Controls" / "Blocked Devices"
          - "Firewall Rules" — create an outbound rule: source = camera IP, destination = ANY, action = DROP
          - "Schedule" — set 24/7 blocked
          Save. The camera stays on your Wi-Fi and can still stream to your phone LOCALLY, but it
          can no longer phone home to the Chinese cloud.
        </Step>

        <Step n={4} title="Change every default password">
          Even offline, an attacker on your Wi-Fi could reach it. Open HDMiniCam Pro (or whichever
          app it uses), go to Settings → Security → change the admin password. Store the new one
          in VauLt under Logins.
        </Step>

        <Step n={5} title="Turn off UPnP on your router">
          Router → Advanced → UPnP → Disable. Many cheap cameras auto-forward themselves to the
          internet through UPnP without asking.
        </Step>

        <Step n={6} title="Verify it worked">
          After blocking, try to access the camera from mobile data (turn off your phone's Wi-Fi).
          If the manufacturer's app can no longer reach it, the block is effective. The camera
          should still work when your phone is on the same Wi-Fi as it.
        </Step>

        <Text style={styles.foot}>
          For maximum peace of mind, put IoT devices on a separate guest Wi-Fi network so they
          can't reach your phone/PC even locally.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{n}</Text></View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <Text style={styles.stepBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.color.onSurface, fontSize: 18, fontWeight: "800" },
  warn: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    padding: 14, borderRadius: 12,
    backgroundColor: theme.color.error + "18",
    borderWidth: 1, borderColor: theme.color.error + "55",
    marginBottom: 20,
  },
  warnText: { color: theme.color.onSurface, fontSize: 13, lineHeight: 19, flex: 1 },
  step: {
    marginBottom: 16, padding: 14, borderRadius: 12,
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
  },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  stepBadge: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
    backgroundColor: theme.color.brand,
  },
  stepBadgeText: { color: theme.color.onBrand, fontWeight: "800", fontSize: 13 },
  stepTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "700", flex: 1 },
  stepBody: { color: theme.color.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  foot: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontStyle: "italic", marginTop: 8, lineHeight: 18 },
});
