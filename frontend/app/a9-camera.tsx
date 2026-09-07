// A9 Camera screen — discovers and views local A9 / mini Wi-Fi cameras
// speaking the CS2 "PPPP" protocol.
//
// WARNING: The A9 protocol is proprietary and unstable. Discovery may
// silently fail with some clones, and video decoding assumes H.264 main
// profile. This screen ONLY works on a native Android build; on iOS or
// Expo Go it shows a friendly not-available notice.
import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, ActivityIndicator, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { theme } from "@/src/lib/theme";
import {
  a9CameraAvailable, a9CameraEmitter, discoverCameras, connectCamera,
  startCameraVideo, stopCamera, A9VideoView,
  type A9DiscoveredEvent, type A9FrameEvent, type A9DisconnectEvent,
} from "@/src/lib/a9camera";

type Cam = { uid: string; ip: string; port: number };

export default function A9CameraScreen() {
  const router = useRouter();
  const available = a9CameraAvailable();

  const [cams, setCams] = useState<Cam[]>([]);
  const [scanning, setScanning] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [manualPort, setManualPort] = useState("32100");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [currentCam, setCurrentCam] = useState<Cam | null>(null);
  const [lastNal, setLastNal] = useState<string>("");
  const [frameCount, setFrameCount] = useState(0);
  const [bytesRx, setBytesRx] = useState(0);
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!a9CameraEmitter) return;
    const s1 = a9CameraEmitter.addListener("A9Camera:discovered", (e: A9DiscoveredEvent) => {
      const k = `${e.ip}:${e.port}`;
      if (seenKeys.current.has(k)) return;
      seenKeys.current.add(k);
      setCams((prev) => [...prev, { uid: e.uid, ip: e.ip, port: e.port }]);
    });
    const s2 = a9CameraEmitter.addListener("A9Camera:frame", (e: A9FrameEvent) => {
      setLastNal(e.nal);
      setFrameCount((c) => c + 1);
      setBytesRx((b) => b + e.bytes);
    });
    const s3 = a9CameraEmitter.addListener("A9Camera:disconnected", (e: A9DisconnectEvent) => {
      setSessionId(null);
      setCurrentCam(null);
      Alert.alert("Camera disconnected", `Reason: ${e.reason}`);
    });
    return () => { s1.remove(); s2.remove(); s3.remove(); };
  }, []);

  const scan = async () => {
    if (!available) return;
    setScanning(true);
    setCams([]);
    seenKeys.current.clear();
    const found = await discoverCameras(4000);
    // Merge (some cameras only surface in the resolved promise, others via events)
    for (const c of found) {
      const k = `${c.ip}:${c.port}`;
      if (!seenKeys.current.has(k)) {
        seenKeys.current.add(k);
        setCams((prev) => [...prev, c]);
      }
    }
    setScanning(false);
  };

  const connectTo = async (cam: Cam) => {
    if (!available) return;
    if (sessionId != null) await stopCamera(sessionId).catch(() => undefined);
    setConnecting(true);
    setFrameCount(0);
    setBytesRx(0);
    setLastNal("");
    try {
      const sid = await connectCamera(cam.ip, cam.port);
      setSessionId(sid);
      setCurrentCam(cam);
      await startCameraVideo(sid);
    } catch (e: any) {
      Alert.alert("Connection failed", e?.message ?? "Camera did not respond in time.");
    } finally {
      setConnecting(false);
    }
  };

  const connectManual = async () => {
    const port = parseInt(manualPort, 10);
    if (!manualIp || Number.isNaN(port)) {
      Alert.alert("Invalid", "Enter a valid IP and port.");
      return;
    }
    await connectTo({ uid: `manual@${manualIp}`, ip: manualIp, port });
  };

  const disconnect = async () => {
    if (sessionId == null) return;
    await stopCamera(sessionId);
    setSessionId(null);
    setCurrentCam(null);
  };

  return (
    <SafeAreaView style={styles.c} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="a9-back">
          <Feather name="chevron-left" size={22} color={theme.color.onSurface} />
        </Pressable>
        <Text style={styles.title}>A9 Camera</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <View style={styles.warn}>
          <Feather name="alert-triangle" size={18} color={theme.color.warning} />
          <Text style={styles.warnText}>
            Local-network-only. Requires a native Android build (Expo Go will not work).
            The protocol is proprietary and some cameras may not respond even when reachable.
          </Text>
        </View>

        {!available && (
          <View style={styles.notice}>
            <Feather name="info" size={18} color={theme.color.info} />
            <Text style={styles.warnText}>
              {Platform.OS === "ios"
                ? "iOS support is not yet implemented. This screen is Android-only for now."
                : "Native module unavailable — you are in Expo Go. Publish and generate an Android build to try live discovery."}
            </Text>
          </View>
        )}

        {sessionId != null && currentCam && (
          <View style={styles.streamCard}>
            <View style={styles.streamHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.streamTitle}>{currentCam.uid}</Text>
                <Text style={styles.streamSub}>{currentCam.ip}:{currentCam.port}</Text>
              </View>
              <Pressable onPress={disconnect} style={styles.stopBtn} testID="a9-stop">
                <Feather name="square" size={14} color={theme.color.onBrand} />
                <Text style={styles.stopBtnText}>Stop</Text>
              </Pressable>
            </View>
            <View style={styles.videoWrap}>
              {A9VideoView ? (
                <A9VideoView style={styles.video} nal={lastNal} />
              ) : (
                <View style={[styles.video, styles.videoPlaceholder]}>
                  <Feather name="video-off" size={28} color={theme.color.onSurfaceTertiary} />
                  <Text style={styles.placeholderText}>Native SurfaceView unavailable</Text>
                </View>
              )}
            </View>
            <View style={styles.stats}>
              <Stat label="Frames" value={String(frameCount)} />
              <Stat label="Bytes" value={fmtBytes(bytesRx)} />
              <Stat label="Session" value={`#${sessionId}`} />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Local discovery</Text>
            <Pressable
              onPress={scan}
              disabled={!available || scanning}
              style={[styles.scanBtn, (!available || scanning) && styles.scanBtnDisabled]}
              testID="a9-scan"
            >
              {scanning ? (
                <ActivityIndicator size="small" color={theme.color.onBrand} />
              ) : (
                <>
                  <Feather name="radio" size={14} color={theme.color.onBrand} />
                  <Text style={styles.scanBtnText}>Scan Wi-Fi</Text>
                </>
              )}
            </Pressable>
          </View>

          {cams.length === 0 && !scanning && (
            <Text style={styles.emptyText}>
              No cameras yet. Tap {`"Scan Wi-Fi"`} while on the same network as the A9 camera.
            </Text>
          )}
          {cams.map((c) => (
            <Pressable
              key={`${c.ip}:${c.port}`}
              onPress={() => connectTo(c)}
              disabled={connecting}
              style={styles.camRow}
              testID={`a9-cam-${c.ip}`}
            >
              <View style={styles.camIcon}>
                <Feather name="video" size={18} color={theme.color.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.camTitle}>{c.uid}</Text>
                <Text style={styles.camSub}>{c.ip}:{c.port}</Text>
              </View>
              {connecting ? (
                <ActivityIndicator size="small" color={theme.color.brand} />
              ) : (
                <Feather name="play-circle" size={22} color={theme.color.brand} />
              )}
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual connect</Text>
          <Text style={styles.hint}>
            If discovery fails, find the camera IP from your router admin page and enter it here.
          </Text>
          <View style={styles.manualRow}>
            <TextInput
              style={[styles.input, { flex: 2 }]}
              placeholder="192.168.1.50"
              placeholderTextColor={theme.color.onSurfaceTertiary}
              value={manualIp}
              onChangeText={setManualIp}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              testID="a9-manual-ip"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="32100"
              placeholderTextColor={theme.color.onSurfaceTertiary}
              value={manualPort}
              onChangeText={setManualPort}
              keyboardType="number-pad"
              testID="a9-manual-port"
            />
          </View>
          <Pressable
            onPress={connectManual}
            disabled={!available || connecting}
            style={[styles.connectBtn, (!available || connecting) && styles.scanBtnDisabled]}
            testID="a9-manual-connect"
          >
            <Feather name="link" size={14} color={theme.color.onBrand} />
            <Text style={styles.scanBtnText}>Connect</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security note</Text>
          <Text style={styles.hint}>
            This view bypasses the manufacturer{`'`}s cloud — traffic stays inside your Wi-Fi. If your
            router still lets the camera reach the internet, follow the {`"Secure your Wi-Fi camera"`}
            guide to firewall it off. VauLt never stores the camera credentials.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: theme.color.border,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: theme.color.onSurface, fontSize: 17, fontWeight: "600" },
  warn: {
    flexDirection: "row", gap: 10, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: "#3F2A11", marginBottom: 12,
  },
  warnText: { flex: 1, color: theme.color.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
  notice: {
    flexDirection: "row", gap: 10, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceSecondary, marginBottom: 12,
  },
  section: {
    backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg,
    padding: 16, marginBottom: 16,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600", marginBottom: 8 },
  hint: { color: theme.color.onSurfaceTertiary, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  scanBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.color.brand,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill,
  },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnText: { color: theme.color.onBrand, fontWeight: "600", fontSize: 13 },
  emptyText: { color: theme.color.onSurfaceTertiary, fontSize: 13, paddingVertical: 8, textAlign: "center" },
  camRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderColor: theme.color.border,
  },
  camIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  camTitle: { color: theme.color.onSurface, fontSize: 14, fontWeight: "500" },
  camSub: { color: theme.color.onSurfaceTertiary, fontSize: 12 },
  manualRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  input: {
    backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    paddingHorizontal: 12, paddingVertical: 10, color: theme.color.onSurface, fontSize: 14,
    borderWidth: 1, borderColor: theme.color.border,
  },
  connectBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.color.brand,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: theme.radius.md,
    alignSelf: "flex-start",
  },
  streamCard: {
    backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.lg,
    padding: 12, marginBottom: 16,
  },
  streamHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  streamTitle: { color: theme.color.onSurface, fontSize: 14, fontWeight: "600" },
  streamSub: { color: theme.color.onSurfaceTertiary, fontSize: 12 },
  stopBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.color.error,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill,
  },
  stopBtnText: { color: theme.color.onBrand, fontWeight: "600", fontSize: 12 },
  videoWrap: { aspectRatio: 4 / 3, backgroundColor: "#000", borderRadius: theme.radius.md, overflow: "hidden" },
  video: { flex: 1 },
  videoPlaceholder: { alignItems: "center", justifyContent: "center", gap: 8 },
  placeholderText: { color: theme.color.onSurfaceTertiary, fontSize: 12 },
  stats: { flexDirection: "row", gap: 8, marginTop: 10 },
  statBox: {
    flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.md,
    padding: 8, alignItems: "center",
  },
  statValue: { color: theme.color.onSurface, fontSize: 14, fontWeight: "600" },
  statLabel: { color: theme.color.onSurfaceTertiary, fontSize: 10, marginTop: 2 },
});
