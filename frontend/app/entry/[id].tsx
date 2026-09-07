import { useMemo, useState, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  Modal, Alert, Switch,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVault, VaultCategory, VaultEntry } from "@/src/lib/vault";
import { theme } from "@/src/lib/theme";
import { generatePassword, generatePassphrase, scorePassword, GenOpts } from "@/src/lib/passwords";
import { pickAndUpload, downloadAndDecrypt } from "@/src/lib/media";
import { Image } from "expo-image";

const CATS: { key: VaultCategory; label: string; icon: any }[] = [
  { key: "login", label: "Login", icon: "key" },
  { key: "card", label: "Card", icon: "credit-card" },
  { key: "identity", label: "Identity", icon: "user" },
  { key: "note", label: "Note", icon: "file-text" },
];

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { vault, addEntry, updateEntry, deleteEntry } = useVault();
  const isNew = id === "new";
  const existing = !isNew ? vault?.entries.find((e) => e.id === id) : undefined;

  const [category, setCategory] = useState<VaultCategory>(existing?.category || "login");
  const [title, setTitle] = useState(existing?.title || "");
  const [username, setUsername] = useState(existing?.username || "");
  const [password, setPassword] = useState(existing?.password || "");
  const [url, setUrl] = useState(existing?.url || "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [cardholder, setCardholder] = useState(existing?.cardholder || "");
  const [cardNumber, setCardNumber] = useState(existing?.card_number || "");
  const [expiry, setExpiry] = useState(existing?.expiry || "");
  const [cvv, setCvv] = useState(existing?.cvv || "");
  const [fullName, setFullName] = useState(existing?.full_name || "");
  const [email, setEmail] = useState(existing?.email || "");
  const [phone, setPhone] = useState(existing?.phone || "");
  const [address, setAddress] = useState(existing?.address || "");
  const [reveal, setReveal] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState(existing?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const vaultCtx = useVault() as any;

  const uploadMedia = async (kind: "image" | "video", source: "gallery" | "camera" = "gallery") => {
    if (!vaultCtx.keys) return;
    setUploading(true);
    try {
      const att = await pickAndUpload(vaultCtx.keys, kind, source);
      if (att) setAttachments((a: any) => [...a, att]);
    } catch (e: any) {
      Alert.alert("Upload failed", e.message);
    } finally {
      setUploading(false);
    }
  };

  const viewAttachment = async (fileId: string) => {
    if (!vaultCtx.keys) return;
    try {
      const { dataUri, mime, name } = await downloadAndDecrypt(vaultCtx.keys, fileId);
      if (Platform.OS === "web") {
        const w = window.open("");
        if (w) {
          if (mime.startsWith("video/")) {
            w.document.write(`<video controls autoplay src="${dataUri}" style="max-width:100%"></video>`);
          } else {
            w.document.write(`<img src="${dataUri}" style="max-width:100%" alt="${name}"/>`);
          }
        }
      } else {
        Alert.alert(name, "Decrypted successfully — preview coming soon");
      }
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  const removeAttachment = (fid: string) => {
    setAttachments((a: any) => a.filter((x: any) => x.file_id !== fid));
  };

  const strength = useMemo(() => scorePassword(password), [password]);

  const save = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a title for this entry");
      return;
    }
    setSaving(true);
    try {
      const patch: any = {
        category, title: title.trim(),
        username, password, url, notes,
        cardholder, card_number: cardNumber, expiry, cvv,
        full_name: fullName, email, phone, address,
        attachments,
      };
      if (isNew) await addEntry(patch);
      else await updateEntry(id as string, patch);
      router.back();
    } catch (e: any) {
      Alert.alert("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (isNew) return;
    Alert.alert("Delete entry", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => { await deleteEntry(id as string); router.back(); },
      },
    ]);
  };

  const copy = async (val: string, label: string) => {
    await Clipboard.setStringAsync(val);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Copied", `${label} copied to clipboard`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.color.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn} testID="entry-back">
            <Feather name="x" size={22} color={theme.color.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? "New entry" : "Edit entry"}</Text>
          <Pressable onPress={save} style={styles.headerBtn} disabled={saving} testID="entry-save">
            <Text style={styles.saveText}>{saving ? "…" : "Save"}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            {CATS.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.catChip, active && styles.catChipActive]}
                  testID={`cat-${c.key}`}
                >
                  <Feather name={c.icon} size={14} color={active ? theme.color.brand : theme.color.onSurfaceTertiary} />
                  <Text style={[styles.catText, active && styles.catTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. GitHub" testID="field-title" />

          {category === "login" && (
            <>
              <Field label="Username / Email" value={username} onChangeText={setUsername} placeholder="john@example.com" testID="field-username" copyable onCopy={() => copy(username, "Username")} />
              <PasswordField
                value={password}
                onChangeText={setPassword}
                reveal={reveal}
                onToggleReveal={() => setReveal((r) => !r)}
                onGen={() => setGenOpen(true)}
                onCopy={() => copy(password, "Password")}
              />
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  <View style={styles.strengthBar}>
                    <View style={[styles.strengthFill, { width: `${strength.score}%`, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                </View>
              )}
              <Field label="Website" value={url} onChangeText={setUrl} placeholder="https://" testID="field-url" />
              <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="" multiline testID="field-notes" />
            </>
          )}

          {category === "card" && (
            <>
              <Field label="Cardholder" value={cardholder} onChangeText={setCardholder} testID="field-cardholder" />
              <Field label="Card number" value={cardNumber} onChangeText={setCardNumber} keyboardType="number-pad" testID="field-cardnumber" copyable onCopy={() => copy(cardNumber, "Card number")} />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Expiry" value={expiry} onChangeText={setExpiry} placeholder="MM/YY" testID="field-expiry" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="CVV" value={cvv} onChangeText={setCvv} keyboardType="number-pad" secure testID="field-cvv" />
                </View>
              </View>
              <Field label="Notes" value={notes} onChangeText={setNotes} multiline testID="field-notes" />
            </>
          )}

          {category === "identity" && (
            <>
              <Field label="Full name" value={fullName} onChangeText={setFullName} testID="field-fullname" />
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" testID="field-email" />
              <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" testID="field-phone" />
              <Field label="Address" value={address} onChangeText={setAddress} multiline testID="field-address" />
              <Field label="Notes" value={notes} onChangeText={setNotes} multiline testID="field-notes" />
            </>
          )}

          {category === "note" && (
            <Field label="Note" value={notes} onChangeText={setNotes} multiline testID="field-note" />
          )}

          {!isNew && (
            <Pressable onPress={remove} style={styles.deleteBtn} testID="entry-delete">
              <Feather name="trash-2" size={16} color={theme.color.error} />
              <Text style={styles.deleteText}>Delete entry</Text>
            </Pressable>
          )}

          <Text style={[styles.label, { marginTop: 24 }]}>Encrypted attachments</Text>
          <View style={{ gap: 8 }}>
            {attachments.map((a: any) => (
              <View key={a.file_id} style={styles.attRow} testID={`att-${a.file_id}`}>
                <Feather name={a.kind === "video" ? "video" : "image"} size={16} color={theme.color.brand} />
                <Text style={styles.attName} numberOfLines={1}>{a.name}</Text>
                <Pressable onPress={() => viewAttachment(a.file_id)} style={styles.attBtn} testID={`att-view-${a.file_id}`}>
                  <Feather name="eye" size={14} color={theme.color.onSurface} />
                </Pressable>
                <Pressable onPress={() => removeAttachment(a.file_id)} style={styles.attBtn}>
                  <Feather name="x" size={14} color={theme.color.error} />
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <Pressable onPress={() => uploadMedia("image", "camera")} disabled={uploading} style={styles.attAdd} testID="att-capture-photo">
                <Feather name="camera" size={16} color={theme.color.brand} />
                <Text style={styles.attAddText}>Take photo</Text>
              </Pressable>
              <Pressable onPress={() => uploadMedia("image", "gallery")} disabled={uploading} style={styles.attAdd} testID="att-add-image">
                <Feather name="image" size={16} color={theme.color.brand} />
                <Text style={styles.attAddText}>{uploading ? "Uploading…" : "Gallery"}</Text>
              </Pressable>
              <Pressable onPress={() => uploadMedia("video", "camera")} disabled={uploading} style={styles.attAdd} testID="att-capture-video">
                <Feather name="video" size={16} color={theme.color.brand} />
                <Text style={styles.attAddText}>Record</Text>
              </Pressable>
              <Pressable onPress={() => uploadMedia("video", "gallery")} disabled={uploading} style={styles.attAdd} testID="att-add-video">
                <Feather name="film" size={16} color={theme.color.brand} />
                <Text style={styles.attAddText}>Video</Text>
              </Pressable>
            </View>
            <Text style={styles.attHint}>Media is encrypted on this device before upload. Only you can decrypt it.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <GeneratorModal
        visible={genOpen}
        onClose={() => setGenOpen(false)}
        onUse={(v: string) => { setPassword(v); setGenOpen(false); }}
      />
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, secure, copyable, onCopy, testID }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.onSurfaceTertiary}
          style={[styles.input, multiline && { minHeight: 80, textAlignVertical: "top" }]}
          multiline={multiline}
          keyboardType={keyboardType}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          testID={testID}
        />
        {copyable && value?.length > 0 && (
          <Pressable onPress={onCopy} style={styles.inputAction} testID={`${testID}-copy`}>
            <Feather name="copy" size={16} color={theme.color.onSurfaceTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PasswordField({ value, onChangeText, reveal, onToggleReveal, onGen, onCopy }: any) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>Password</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Password"
          placeholderTextColor={theme.color.onSurfaceTertiary}
          style={[styles.input, { fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace" }]}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoCorrect={false}
          testID="field-password"
        />
        <View style={{ flexDirection: "row" }}>
          <Pressable onPress={onToggleReveal} style={styles.inputAction} testID="field-password-reveal">
            <Feather name={reveal ? "eye-off" : "eye"} size={16} color={theme.color.onSurfaceTertiary} />
          </Pressable>
          {value?.length > 0 && (
            <Pressable onPress={onCopy} style={styles.inputAction} testID="field-password-copy">
              <Feather name="copy" size={16} color={theme.color.onSurfaceTertiary} />
            </Pressable>
          )}
          <Pressable onPress={onGen} style={styles.inputAction} testID="field-password-gen">
            <Feather name="refresh-cw" size={16} color={theme.color.brand} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function GeneratorModal({ visible, onClose, onUse }: { visible: boolean; onClose: () => void; onUse: (value: string) => void }) {
  const [mode, setMode] = useState<"password" | "passphrase">("password");
  const [opts, setOpts] = useState<GenOpts>({ length: 20, upper: true, lower: true, digits: true, symbols: true, avoidAmbiguous: true });
  const [words, setWords] = useState(4);
  const [val, setVal] = useState("");

  useEffect(() => {
    setVal(mode === "password" ? generatePassword(opts) : generatePassphrase(words));
  }, [mode, opts, words, visible]);

  const strength = scorePassword(val);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Password Generator</Text>

          <View style={styles.modeTabs}>
            <Pressable onPress={() => setMode("password")} style={[styles.modeTab, mode === "password" && styles.modeTabActive]} testID="gm-password">
              <Text style={[styles.modeText, mode === "password" && styles.modeTextActive]}>Password</Text>
            </Pressable>
            <Pressable onPress={() => setMode("passphrase")} style={[styles.modeTab, mode === "passphrase" && styles.modeTabActive]} testID="gm-passphrase">
              <Text style={[styles.modeText, mode === "passphrase" && styles.modeTextActive]}>Passphrase</Text>
            </Pressable>
          </View>

          <View style={styles.output} testID="gm-output">
            <Text style={styles.outputText} numberOfLines={3} selectable>{val}</Text>
            <View style={styles.strengthRow}>
              <View style={styles.strengthBar}>
                <View style={[styles.strengthFill, { width: `${strength.score}%`, backgroundColor: strength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          </View>

          {mode === "password" ? (
            <>
              <Row label={`Length: ${opts.length}`}>
                <View style={styles.stepper}>
                  <Pressable onPress={() => setOpts({ ...opts, length: Math.max(8, opts.length - 1) })} style={styles.stepBtn}><Feather name="minus" size={14} color={theme.color.onSurface} /></Pressable>
                  <Pressable onPress={() => setOpts({ ...opts, length: Math.min(64, opts.length + 1) })} style={styles.stepBtn}><Feather name="plus" size={14} color={theme.color.onSurface} /></Pressable>
                </View>
              </Row>
              <SwRow label="Uppercase" value={opts.upper} onChange={(v: boolean) => setOpts({ ...opts, upper: v })} />
              <SwRow label="Digits" value={opts.digits} onChange={(v: boolean) => setOpts({ ...opts, digits: v })} />
              <SwRow label="Symbols" value={opts.symbols} onChange={(v: boolean) => setOpts({ ...opts, symbols: v })} />
              <SwRow label="Avoid ambiguous" value={opts.avoidAmbiguous} onChange={(v: boolean) => setOpts({ ...opts, avoidAmbiguous: v })} />
            </>
          ) : (
            <Row label={`Words: ${words}`}>
              <View style={styles.stepper}>
                <Pressable onPress={() => setWords(Math.max(3, words - 1))} style={styles.stepBtn}><Feather name="minus" size={14} color={theme.color.onSurface} /></Pressable>
                <Pressable onPress={() => setWords(Math.min(10, words + 1))} style={styles.stepBtn}><Feather name="plus" size={14} color={theme.color.onSurface} /></Pressable>
              </View>
            </Row>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <Pressable onPress={onClose} style={[styles.modalBtn, { flex: 1, backgroundColor: theme.color.surfaceTertiary }]} testID="gm-cancel">
              <Text style={{ color: theme.color.onSurface, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onUse(val)} style={[styles.modalBtn, { flex: 2, backgroundColor: theme.color.brand }]} testID="gm-use">
              <Text style={{ color: theme.color.onBrand, fontWeight: "700" }}>Use this password</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, children }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
      <Text style={{ color: theme.color.onSurface, fontSize: 14 }}>{label}</Text>
      {children}
    </View>
  );
}
function SwRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Row label={label}>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.color.surfaceTertiary, true: theme.color.brand }} thumbColor="#F4F4F5" />
    </Row>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  headerBtn: { minWidth: 60, paddingVertical: 8, paddingHorizontal: 8 },
  headerTitle: { color: theme.color.onSurface, fontSize: 16, fontWeight: "700" },
  saveText: { color: theme.color.brand, fontSize: 15, fontWeight: "700", textAlign: "right" },
  label: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: 12,
  },
  input: { flex: 1, color: theme.color.onSurface, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
  inputAction: { paddingHorizontal: 10, paddingVertical: 12 },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
  },
  catChipActive: { backgroundColor: theme.color.brandTertiary, borderColor: theme.color.brand },
  catText: { color: theme.color.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  catTextActive: { color: theme.color.brand },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 12 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.color.surfaceTertiary, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 3 },
  strengthLabel: { fontSize: 11, fontWeight: "600" },
  deleteBtn: {
    marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: theme.color.error + "55",
    backgroundColor: theme.color.error + "11",
  },
  deleteText: { color: theme.color.error, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: theme.color.surfaceSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surfaceTertiary, alignSelf: "center", marginBottom: 12 },
  modalTitle: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  modeTabs: { flexDirection: "row", backgroundColor: theme.color.surface, borderRadius: 10, padding: 4, marginBottom: 12 },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  modeTabActive: { backgroundColor: theme.color.surfaceTertiary },
  modeText: { color: theme.color.onSurfaceTertiary, fontWeight: "600", fontSize: 13 },
  modeTextActive: { color: theme.color.onSurface },
  output: { padding: 16, backgroundColor: theme.color.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.color.border, marginBottom: 8 },
  outputText: { color: theme.color.brand, fontSize: 18, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", marginBottom: 8, textAlign: "center" },
  stepper: { flexDirection: "row", gap: 8 },
  stepBtn: { width: 28, height: 28, borderRadius: 6, backgroundColor: theme.color.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  modalBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  attRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  attName: { flex: 1, color: theme.color.onSurface, fontSize: 13 },
  attBtn: { padding: 6, backgroundColor: theme.color.surfaceTertiary, borderRadius: 6 },
  attAdd: { minWidth: 90, flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  attAddText: { color: theme.color.onSurface, fontSize: 13, fontWeight: "600" },
  attHint: { color: theme.color.onSurfaceTertiary, fontSize: 11, marginTop: 4 },
});
