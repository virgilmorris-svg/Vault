# VauLt Native Extensions

This folder contains the **native source files** for two features that require a real iOS/Android build (they do **not** work in Expo Go):

1. **Home-screen Widget** — Quick Copy tile on your home screen
2. **Autofill Provider** — VauLt appears as an option when tapping password fields in other apps/Safari/Chrome

## How they get built

Everything is wired through the custom Expo config plugin `plugins/withVauLtExtensions.js` referenced in `app.json`. When you:

1. Click **Publish** in the Emergent panel (top-right)
2. Then **Generate iOS/Android build**

…the Emergent build pipeline runs `expo prebuild`, which:

- iOS: creates the `ios/VaultWidget/` and `ios/VaultAutofill/` extension targets from these Swift sources, adds the App Group `group.com.emergent.vault` to entitlements so the extension can read the encrypted vault blob, and registers the URL scheme `vault://`.
- Android: copies `android/app/src/main/java/.../QuickCopyWidgetProvider.kt`, `VauLtAutofillService.kt`, and the associated XML into the generated Android project, and registers them in `AndroidManifest.xml`.

## Contract between the app and the extensions

All communication goes through:

- **iOS**: an App Group shared `UserDefaults` (key `com.vault.quickcopy.entries`) that stores a redacted list `{id, title, username, url}` — **never** the plaintext password. Tapping a widget/autofill row opens the app via `vault://quick-copy?entry_id=…` or `vault://autofill?domain=…`. The app decrypts locally with the master key held only in-process (or SecureStore behind biometrics).
- **Android**: the same redacted list is stored in standard `SharedPreferences` (`vault_widget_prefs`). The widget/autofill service reads titles/usernames only; requesting a password fires a `PendingIntent` that opens the app, which decrypts and returns via `IntentSender.sendIntent()`.

This preserves zero-knowledge: the extension processes see metadata only, never plaintext passwords.

## Files

```
native/
├── ios/
│   ├── VaultWidget/
│   │   ├── VaultWidget.swift
│   │   └── Info.plist
│   └── VaultAutofill/
│       ├── CredentialProviderViewController.swift
│       └── Info.plist
└── android/
    ├── widget/
    │   ├── QuickCopyWidgetProvider.kt
    │   ├── quick_copy_widget_info.xml
    │   └── quick_copy_widget.xml
    └── autofill/
        ├── VauLtAutofillService.kt
        └── vault_autofill_service.xml
```
