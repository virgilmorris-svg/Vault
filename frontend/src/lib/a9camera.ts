// a9camera.ts — JS bridge for the native A9Camera module (Android only for now).
// On iOS or in Expo Go the module is absent and every call resolves gracefully
// to a "not-supported" result so screens don't crash.
//
// The A9 camera integration is LOCAL-network only, requires a native build,
// and depends on a proprietary undocumented protocol that varies between
// clones — expect discovery failures with some units even on the LAN.
import { NativeModules, NativeEventEmitter, Platform, requireNativeComponent } from "react-native";

type NativeA9 = {
  isSupported: () => Promise<boolean>;
  discover: (timeoutMs: number) => Promise<{ uid: string; ip: string; port: number }[]>;
  connect: (ip: string, port: number) => Promise<number>;
  startVideo: (sessionId: number) => Promise<boolean>;
  stop: (sessionId: number) => Promise<boolean>;
  addListener: (event: string) => void;
  removeListeners: (n: number) => void;
};

const native = (NativeModules as any).A9Camera as NativeA9 | undefined;

export const a9CameraAvailable = () => Platform.OS === "android" && !!native;

export const a9CameraEmitter = native ? new NativeEventEmitter(native as any) : null;

export async function discoverCameras(timeoutMs = 3000) {
  if (!native) return [];
  try { return await native.discover(timeoutMs); } catch { return []; }
}

export async function connectCamera(ip: string, port: number): Promise<number> {
  if (!native) throw new Error("A9Camera not available (requires Android native build).");
  return native.connect(ip, port);
}

export async function startCameraVideo(sessionId: number) {
  if (!native) return false;
  return native.startVideo(sessionId);
}

export async function stopCamera(sessionId: number) {
  if (!native) return false;
  return native.stop(sessionId);
}

/** Native SurfaceView-backed component. Undefined on iOS/Expo Go. */
export const A9VideoView: any = (() => {
  try {
    if (Platform.OS !== "android") return null;
    return requireNativeComponent("A9VideoView");
  } catch {
    return null;
  }
})();

export type A9DiscoveredEvent = { uid: string; ip: string; port: number };
export type A9FrameEvent = { sessionId: number; seq: number; nal: string; bytes: number };
export type A9DisconnectEvent = { sessionId: number; reason: string };
