# 📱 Google Play Store Deployment Guide

## ✅ Configuration Status
- **Project**: VauLt (SentinelPass) - End-to-end encrypted password manager
- **Platform**: Android (Expo EAS Build)
- **Version**: 1.0.0 (versionCode: 2)
- **Package**: `com.emergent.securevaultsync.gbpwid`
- **Status**: Ready for final publication

---

## 🔑 Prerequisites (Action Required)

### 1. **Google Play Console Account**
- [ ] Create/Access [Google Play Console](https://play.google.com/console)
- [ ] Create new app entry: **VauLt** or **SentinelPass**
- [ ] Fill in app details:
  - Title: VauLt - Encrypted Password Manager
  - Short description: Zero-knowledge password manager with end-to-end encryption
  - Full description: (See below)
  - Category: Productivity
  - Rating: 3+ (for biometric/auth features)

### 2. **Generate Service Account Key**
```bash
# In Google Play Console:
# 1. Go to Settings > Developer Account > API access
# 2. Create new Service Account
# 3. Create new JSON key
# 4. Download and save as: frontend/google-play-api-key.json
```

### 3. **Create Android Keystore**
```bash
# Generate signing key (run in frontend directory)
eas credentials configure --platform android

# Follow prompts to:
# - Create new keystore
# - Set keystore password
# - Set key alias and password
# EAS will store credentials in ~/.eas/credentials.json
```

---

## 📋 App Description for Play Store

**Title**: VauLt - Encrypted Password Manager

**Short Description** (80 chars):
Zero-knowledge password manager with biometric unlock and encrypted cloud sync.

**Full Description**:
```
VauLt is a zero-knowledge, end-to-end encrypted password manager that keeps your 
passwords, cards, and sensitive data secure on your device.

🔐 Zero-Knowledge Security
- Your master password never reaches our servers
- All vault data encrypted locally with AES-256-CBC
- Only encrypted blobs stored on cloud servers

✨ Features
- Password generator (8-64 chars, customizable)
- Biometric unlock (Face ID / Fingerprint)
- Auto-lock timer (immediate / 1 / 5 / 15 / 30 min)
- Cloud sync across devices
- Security dashboard with password strength analysis
- Encrypted attachments (photos, videos)
- Search & category filtering
- Session management & device revocation

🛡️ Privacy First
- No recovery emails (consistent with zero-knowledge design)
- No master password reset (user controls their security)
- No tracking or analytics
- Open security model (audit-friendly)

⚙️ Technical Details
- Built with Expo (React Native)
- FastAPI backend with MongoDB
- PBKDF2-SHA256 key derivation (200k iterations)
- HMAC-SHA256 authentication
- TLS/HTTPS for all communications
```

**Privacy Policy URL**: https://yourdomin.com/privacy

**Screenshots** (Required - at least 2):
- Screenshot 1: Auth/Login screen with Google Sign-In
- Screenshot 2: Vault main screen with entries
- Screenshot 3: Password generator interface
- Screenshot 4: Security dashboard

---

## 🚀 Build & Submission Steps

### Step 1: Build for Google Play
```bash
cd frontend

# Create production build
eas build --platform android --profile production

# This will:
# - Generate AAB (Android App Bundle) for Play Store
# - Sign with your configured keystore
# - Upload to EAS servers
# - Provide download link once complete (~10-15 min)
```

### Step 2: Download & Test Build
```bash
# EAS will output download link after build completes
# Download and test on physical Android device
adb install app-release.apk  # if testing APK
```

### Step 3: Submit to Play Store
```bash
# After confirming build works:
eas submit --platform android --profile production

# Will prompt for:
# - Google Play Console app ID
# - Service account key path (frontend/google-play-api-key.json)
# - Track selection (production / beta / alpha)
# - Change notes/release notes
```

### Step 4: Google Play Review
- Submission takes 24-48 hours for review
- Monitor status in Play Console
- Address any policy violations
- Once approved, app goes live

---

## 📦 Configuration Files Updated

### ✅ eas.json
- Build configuration for production
- Auto-increment version code
- AAB generation for Play Store
- Submit configuration with Play Store API

### ✅ app.json
- Android package: `com.emergent.securevaultsync.gbpwid`
- Permissions: BIOMETRIC, FINGERPRINT, RECORD_AUDIO
- Intent filters for deep linking
- Adaptive icon configuration

---

## 🔄 Versioning & Updates

**Current Version**: 1.0.0 (versionCode: 2)

**For future updates**:
```bash
# Update version in app.json
# Version format: MAJOR.MINOR.PATCH

# EAS auto-increments versionCode each build
# Example: versionCode 3, 4, 5... as you release updates
```

---

## ✅ Pre-Flight Checklist

Before submitting, verify:

- [ ] Google Play Console account created
- [ ] Service account key downloaded
- [ ] `frontend/google-play-api-key.json` exists
- [ ] Android keystore configured via `eas credentials`
- [ ] app.json has correct package name
- [ ] eas.json has production profile configured
- [ ] Backend API working and accessible
- [ ] All permissions declared in app.json
- [ ] Icon & adaptive icon optimized
- [ ] Privacy policy written
- [ ] Screenshots prepared (4+)
- [ ] Test build installed & verified on device

---

## 🎯 Post-Deployment

Once live on Play Store:

1. **Monitor reviews & ratings**
2. **Setup crash reporting** (Sentry, Firebase)
3. **Track analytics** (if not privacy-violating)
4. **Plan for premium tier** (family sharing, unlimited devices)
5. **Prepare for iOS deployment** (similar process via App Store Connect)

---

## 📞 Support

For EAS issues: `eas --help` or check [Expo EAS documentation](https://docs.expo.dev/eas/)

For Google Play Console: Check [Play Console Help Center](https://support.google.com/googleplay/android-developer)

---

**Generated**: 2026-09-02
**Status**: Configuration Complete - Ready for Credentials & Submission
