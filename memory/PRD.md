# SentinelPass — PRD

## Vision
A zero-knowledge, end-to-end encrypted mobile password manager built with Expo React Native and a FastAPI backend. The plaintext vault never leaves the device.

## MVP Features (implemented)
- **Auth**: Email + account password (bcrypt on server, JWT + refresh with rotation).
- **Master password**: Never sent to server. Derives AES-256 + HMAC-SHA256 keys via PBKDF2-SHA256 (200k iterations, 16-byte random salt).
- **Vault storage**: End-to-end client-side encryption (AES-256-CBC + Encrypt-then-MAC HMAC-SHA256). Server stores only ciphertext blobs.
- **Cloud sync**: `GET /api/vault` and `PUT /api/vault` with monotonic version conflict rejection.
- **Biometric unlock**: expo-local-authentication (Face ID/fingerprint) with the derived key stored in SecureStore.
- **Auto-lock**: Configurable timer (immediately / 1 / 5 / 15 / 30 min) triggered on background.
- **Entries**: Logins, cards, identities, secure notes. Search + category chip filters.
- **Password generator**: Length 8–64, char sets, ambiguous-avoid, passphrase mode.
- **Security dashboard**: Aggregate 0–100 score, weak/reused/aging passwords with drill-downs.
- **Sessions**: List active refresh sessions; revoke device.
- **Encrypted export**: Copies ciphertext blob to clipboard (useless without master password).
- **Home-screen Widget & Autofill**: Native Android widget + system-wide autofill service, scaffolded via Expo config plugin (requires native build).
- **A9 Wi-Fi camera viewer (experimental)**: Native Android module that discovers and streams local A9-family cameras (CS2 "PPPP" protocol) directly over Wi-Fi, bypassing the manufacturer cloud. H.264 decoded via MediaCodec on a native SurfaceView. Requires native build; iOS pending.

## Non-Recovery
Consistent with zero-knowledge: **no server-side master password recovery**. UI warns users.

## Tech Stack
- Frontend: Expo SDK 54, expo-router, expo-secure-store, expo-local-authentication, expo-clipboard, crypto-js.
- Backend: FastAPI + Motor (MongoDB), bcrypt, PyJWT.
- Storage: MongoDB (users, sessions, vaults) — no plaintext, only ciphertext envelopes.

## Business Enhancement
Premium tier for family sharing (shared encrypted vault group) and unlimited devices. Free tier is generous to build trust before conversion.


## Account Deletion (App Store 5.1.1(v)) — DONE
- Backend: `DELETE /api/account` (auth required). Body `{confirmation: email, password?}`. Password accounts must supply the correct password; Google accounts confirm by typing their e-mail. Deletes users, vaults, files, sessions.
- Backend: `GET /health` for Kubernetes probes.
- Frontend: Settings → Compte → "Supprimer mon compte" → `app/delete-account.tsx` (warning card, e-mail confirmation, password input, success modal → /auth). i18n fr/en/es.
- `vault.tsx`: `deleteAccount()` calls API then clears all local secure storage.

- Delete screen now has an "Exporter mon coffre" button (copies encrypted blob to clipboard; requires unlocked vault).

## A9 Camera integration — REMOVED (user request)
- Deleted `native/android/camera/*`, `src/lib/a9camera.ts`, `app/a9-camera.tsx`; removed A9 copy/register/coroutines steps from `plugins/withVauLtExtensions.js`; removed settings row. Photo/video attachments (expo-image-picker + encrypted upload via `media.ts`) are unchanged. The Wi-Fi camera hardening guide (`camera-guide.tsx`) is kept.
