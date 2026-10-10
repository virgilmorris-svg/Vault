// Save the encrypted vault export as a shareable `.vault` file.
// Native: writes to the app cache dir and opens the system share sheet.
// Web: triggers a browser download.
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export function exportFileName(email?: string | null): string {
  const who = (email || "vault").split("@")[0].replace(/[^a-z0-9._-]/gi, "_");
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `VauLt-${who}-${stamp}.vault`;
}

/** Returns "shared" | "downloaded" | "unavailable". */
export async function saveVaultExportFile(blob: string, email?: string | null): Promise<"shared" | "downloaded" | "unavailable"> {
  const name = exportFileName(email);
  if (Platform.OS === "web") {
    // @ts-ignore DOM
    const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
    // @ts-ignore DOM
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    // @ts-ignore DOM
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(blob);
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/octet-stream",
    dialogTitle: name,
    UTI: "public.data",
  });
  return "shared";
}
