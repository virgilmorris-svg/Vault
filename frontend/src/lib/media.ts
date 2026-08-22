// Encrypted media upload/download using client-side crypto + backend proxy to Emergent Object Storage.
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { secure, K } from "./storage";
import { encrypt, decrypt, KeyMaterial } from "./crypto";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

function newFileId() {
  return "f_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function uriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Read failed"));
    reader.onloadend = () => {
      const s = (reader.result as string) || "";
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.readAsDataURL(blob);
  });
}

export type MediaKind = "image" | "video";

export type MediaAttachment = {
  file_id: string;
  mime: string;
  kind: MediaKind;
  name: string;
  size: number;
  created_at: string;
};

export async function pickAndUpload(keys: KeyMaterial, kind: MediaKind, source: "gallery" | "camera" = "gallery"): Promise<MediaAttachment | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera permission is required");
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === "image" ? ["images"] : ["videos"],
      quality: 0.8,
      allowsEditing: false,
    });
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error("Media library permission is required");
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === "image" ? ["images"] : ["videos"],
      quality: 0.8,
      allowsEditing: false,
    });
  }
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const b64 = await uriToBase64(asset.uri);
  const payload = JSON.stringify({ name: asset.fileName || "media", mime: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"), data: b64 });
  const envelope = encrypt(payload, keys);

  const fileId = newFileId();
  const access = await secure.get(K.ACCESS);
  const form = new FormData();
  form.append("file_id", fileId);
  form.append("mime", "application/octet-stream");
  if (Platform.OS === "web") {
    form.append("file", new Blob([envelope], { type: "application/octet-stream" }), fileId + ".bin");
  } else {
    // native: convert to blob-like via Buffer/URI
    form.append("file", { uri: `data:application/octet-stream;base64,${btoa(unescape(encodeURIComponent(envelope)))}`, name: fileId + ".bin", type: "application/octet-stream" } as any);
  }

  const res = await fetch(`${BASE}/api/files/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
    body: form as any,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const meta = await res.json();
  return {
    file_id: fileId,
    mime: asset.mimeType || (kind === "image" ? "image/jpeg" : "video/mp4"),
    kind,
    name: asset.fileName || "media",
    size: meta.size,
    created_at: new Date().toISOString(),
  };
}

export async function downloadAndDecrypt(keys: KeyMaterial, fileId: string): Promise<{ mime: string; name: string; dataUri: string }> {
  const access = await secure.get(K.ACCESS);
  const res = await fetch(`${BASE}/api/files/${fileId}`, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const text = await res.text();
  // envelope was uploaded as bytes representing JSON string
  const envelope = text;
  const plain = decrypt(envelope, keys);
  const parsed = JSON.parse(plain);
  return { mime: parsed.mime, name: parsed.name, dataUri: `data:${parsed.mime};base64,${parsed.data}` };
}
