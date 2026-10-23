// Client-side cryptography for zero-knowledge vault.
// Uses PBKDF2-SHA256 (200k iters) + AES-256-CBC + HMAC-SHA256 (encrypt-then-mac).
// PBKDF2 runs through @noble/hashes (pure JS, typed-array based, ~7x faster than
// crypto-js on Hermes) and yields to the event loop so the UI stays responsive
// on low-end Android devices. Output is byte-identical to the previous crypto-js
// implementation, so existing vaults keep decrypting.
import CryptoJS from "crypto-js";
import * as ExpoCrypto from "expo-crypto";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const KDF_ITERATIONS = 200000;
const KEY_SIZE_BYTES = 64; // 32 bytes AES key + 32 bytes HMAC key

export type KeyMaterial = {
  aesKeyHex: string;
  hmacKeyHex: string;
};

function secureRandomWordArray(len: number) {
  const bytes = ExpoCrypto.getRandomBytes(len);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const wordIndex = i >>> 2;
    words[wordIndex] = (words[wordIndex] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

export function randomBytesB64(len: number): string {
  return CryptoJS.enc.Base64.stringify(secureRandomWordArray(len));
}

export function randomSaltB64(): string {
  return randomBytesB64(16);
}

function b64ToBytes(b64: string): Uint8Array {
  const wa = CryptoJS.enc.Base64.parse(b64);
  const out = new Uint8Array(wa.sigBytes);
  for (let i = 0; i < wa.sigBytes; i++) {
    out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

/**
 * Derive AES + HMAC keys from master password using PBKDF2-SHA256.
 * Async: yields every few hundred iterations so spinners keep animating.
 */
export async function deriveKeys(masterPassword: string, saltB64: string): Promise<KeyMaterial> {
  const derived = await pbkdf2Async(sha256, masterPassword, b64ToBytes(saltB64), {
    c: KDF_ITERATIONS,
    dkLen: KEY_SIZE_BYTES,
    asyncTick: 15,
  });
  const hex = bytesToHex(derived);
  return {
    aesKeyHex: hex.slice(0, 64), // 32 bytes AES-256 key
    hmacKeyHex: hex.slice(64, 128), // 32 bytes HMAC key
  };
}

/**
 * Encrypt plaintext string. Returns a JSON envelope with iv, ct, and mac.
 */
export function encrypt(plaintext: string, keys: KeyMaterial): string {
  const iv = secureRandomWordArray(16);
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
