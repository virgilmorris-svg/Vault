// Client-side cryptography for zero-knowledge vault.
// Uses PBKDF2-SHA256 (200k iters) + AES-256-CBC + HMAC-SHA256 (encrypt-then-mac).
// crypto-js is a pure JS lib, works in Expo Go on iOS, Android and Web.
import CryptoJS from "crypto-js";

const KDF_ITERATIONS = 200000;
const KEY_SIZE_BITS = 512; // 32 bytes AES key + 32 bytes HMAC key

export type KeyMaterial = {
  aesKeyHex: string;
  hmacKeyHex: string;
};

export function randomBytesB64(len: number): string {
  const words = CryptoJS.lib.WordArray.random(len);
  return CryptoJS.enc.Base64.stringify(words);
}

export function randomSaltB64(): string {
  return randomBytesB64(16);
}

/**
 * Derive AES + HMAC keys from master password using PBKDF2-SHA256.
 */
export function deriveKeys(masterPassword: string, saltB64: string): KeyMaterial {
  const salt = CryptoJS.enc.Base64.parse(saltB64);
  const derived = CryptoJS.PBKDF2(masterPassword, salt, {
    keySize: KEY_SIZE_BITS / 32, // in 32-bit words: 16 => 64 bytes total
    iterations: KDF_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  const hex = derived.toString(CryptoJS.enc.Hex);
  return {
    aesKeyHex: hex.slice(0, 64), // 32 bytes AES-256 key
    hmacKeyHex: hex.slice(64, 128), // 32 bytes HMAC key
  };
}

/**
 * Encrypt plaintext string. Returns a JSON envelope with iv, ct, and mac.
 */
export function encrypt(plaintext: string, keys: KeyMaterial): string {
  const iv = CryptoJS.lib.WordArray.random(16);
  const aesKey = CryptoJS.enc.Hex.parse(keys.aesKeyHex);
  const cipher = CryptoJS.AES.encrypt(plaintext, aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ivB64 = CryptoJS.enc.Base64.stringify(iv);
  const ctB64 = cipher.ciphertext.toString(CryptoJS.enc.Base64);

  // encrypt-then-mac over (iv || ct)
  const hmacInput = ivB64 + "." + ctB64;
  const hmacKey = CryptoJS.enc.Hex.parse(keys.hmacKeyHex);
  const mac = CryptoJS.HmacSHA256(hmacInput, hmacKey).toString(CryptoJS.enc.Base64);

  return JSON.stringify({ v: 1, iv: ivB64, ct: ctB64, mac });
}

/**
 * Decrypt envelope. Throws on wrong key or tampered ciphertext.
 */
export function decrypt(envelope: string, keys: KeyMaterial): string {
  const parsed = JSON.parse(envelope);
  const { iv, ct, mac } = parsed;

  const hmacInput = iv + "." + ct;
  const hmacKey = CryptoJS.enc.Hex.parse(keys.hmacKeyHex);
  const expected = CryptoJS.HmacSHA256(hmacInput, hmacKey).toString(CryptoJS.enc.Base64);
  if (expected !== mac) {
    throw new Error("Vault authentication failed — wrong master password or tampered data.");
  }

  const aesKey = CryptoJS.enc.Hex.parse(keys.aesKeyHex);
  const ivWA = CryptoJS.enc.Base64.parse(iv);
  const ctWA = CryptoJS.enc.Base64.parse(ct);
  const cp = CryptoJS.lib.CipherParams.create({ ciphertext: ctWA });
  const dec = CryptoJS.AES.decrypt(cp, aesKey, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const plaintext = dec.toString(CryptoJS.enc.Utf8);
  if (!plaintext) throw new Error("Failed to decrypt vault");
  return plaintext;
}

/**
 * Verifier hash — a client-derived value stored (encrypted) inside the vault
 * to prove the correct master password without needing to compare passwords.
 */
export function verifierHash(keys: KeyMaterial): string {
  return CryptoJS.HmacSHA256("sentinelpass-verifier", CryptoJS.enc.Hex.parse(keys.hmacKeyHex))
    .toString(CryptoJS.enc.Hex);
}
