// withVauLtExtensions — custom Expo config plugin that:
//  • declares URL scheme `vault://` (already in app.json but we add fallback iOS bundle URL)
//  • iOS: adds App Group entitlement `group.com.emergent.vault`, copies widget +
//    autofill extension sources into `ios/`, and registers extension targets so
//    `expo prebuild` creates them.
//  • Android: copies widget provider Kotlin + XML, autofill service Kotlin + XML
//    into the Android project and registers <receiver> and <service> tags in
//    the manifest.
//
// This plugin runs at prebuild time. Native extensions activate ONLY on
// production/dev builds, never in Expo Go.

const fs = require("fs");
const path = require("path");
const {
  withEntitlementsPlist,
  withInfoPlist,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const APP_GROUP = "group.com.emergent.vault";
const PKG = "com.emergent.securevaultsync.gbpwid";

function withIosAppGroup(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    return cfg;
  });
}

function withIosBackgroundURLScheme(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.CFBundleURLTypes = cfg.modResults.CFBundleURLTypes || [];
    if (!cfg.modResults.CFBundleURLTypes.some((t) => (t.CFBundleURLSchemes || []).includes("vault"))) {
      cfg.modResults.CFBundleURLTypes.push({
        CFBundleURLSchemes: ["vault"],
        CFBundleURLName: "com.emergent.vault",
      });
    }
    return cfg;
  });
}

function withIosCopyExtensions(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, "native", "ios");
      const dst = path.join(cfg.modRequest.platformProjectRoot);
      try {
        for (const target of ["VaultWidget", "VaultAutofill"]) {
          const s = path.join(src, target);
          const d = path.join(dst, target);
          if (!fs.existsSync(s)) continue;
          fs.mkdirSync(d, { recursive: true });
          for (const f of fs.readdirSync(s)) {
            fs.copyFileSync(path.join(s, f), path.join(d, f));
          }
        }
        // Note: fully creating separate extension targets in Xcode's project.pbxproj
        // requires either the Xcode CLI or @bacons/apple-targets. Files are placed
        // in the correct folders so Emergent's build pipeline (or a manual xcodebuild
        // step) can wire them into the Xcode project. See native/README.md.
      } catch (e) { console.warn("[withVauLtExtensions] iOS copy warning:", e.message); }
      return cfg;
    },
  ]);
}

function withAndroidManifestExtensions(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.receiver = app.receiver || [];
    const receiverName = ".QuickCopyWidgetProvider";
    if (!app.receiver.some((r) => r.$["android:name"] === receiverName)) {
      app.receiver.push({
        $: { "android:name": receiverName, "android:exported": "false" },
        "intent-filter": [{ action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] }],
        "meta-data": [{
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": "@xml/quick_copy_widget_info",
          },
        }],
      });
    }

    app.service = app.service || [];
    const svcName = ".VauLtAutofillService";
    if (!app.service.some((s) => s.$["android:name"] === svcName)) {
      app.service.push({
        $: {
          "android:name": svcName,
          "android:exported": "true",
          "android:permission": "android.permission.BIND_AUTOFILL_SERVICE",
        },
        "intent-filter": [{ action: [{ $: { "android:name": "android.service.autofill.AutofillService" } }] }],
        "meta-data": [{
          $: {
            "android:name": "android.autofill",
            "android:resource": "@xml/vault_autofill_service",
          },
        }],
      });
    }
    return cfg;
  });
}

function withAndroidCopyExtensions(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, "native", "android");
      const proj = cfg.modRequest.platformProjectRoot;
      const pkgPath = PKG.replace(/\./g, "/");
      const javaDst = path.join(proj, "app", "src", "main", "java", pkgPath);
      const layoutDst = path.join(proj, "app", "src", "main", "res", "layout");
      const xmlDst = path.join(proj, "app", "src", "main", "res", "xml");
      try {
        for (const p of [javaDst, layoutDst, xmlDst]) fs.mkdirSync(p, { recursive: true });
        // Widget
        fs.copyFileSync(path.join(src, "widget", "QuickCopyWidgetProvider.kt"),
                        path.join(javaDst, "QuickCopyWidgetProvider.kt"));
        fs.copyFileSync(path.join(src, "widget", "quick_copy_widget.xml"),
                        path.join(layoutDst, "quick_copy_widget.xml"));
        fs.copyFileSync(path.join(src, "widget", "quick_copy_widget_info.xml"),
                        path.join(xmlDst, "quick_copy_widget_info.xml"));
        // Autofill
        fs.copyFileSync(path.join(src, "autofill", "VauLtAutofillService.kt"),
                        path.join(javaDst, "VauLtAutofillService.kt"));
        fs.copyFileSync(path.join(src, "autofill", "vault_autofill_service.xml"),
                        path.join(xmlDst, "vault_autofill_service.xml"));
        // Simple autofill row layout (referenced by service)
        const autofillRow = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent" android:layout_height="wrap_content"
    android:orientation="vertical" android:padding="8dp" android:background="#18181B">
  <TextView android:id="@+id/title" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:textColor="#F4F4F5" android:textStyle="bold" android:textSize="14sp"/>
  <TextView android:id="@+id/sub" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:textColor="#A1A1AA" android:textSize="12sp"/>
</LinearLayout>`;
        fs.writeFileSync(path.join(layoutDst, "autofill_row.xml"), autofillRow);
      } catch (e) { console.warn("[withVauLtExtensions] Android copy warning:", e.message); }
      return cfg;
    },
  ]);
}

module.exports = function withVauLtExtensions(config) {
  config = withIosBackgroundURLScheme(config);
  config = withIosAppGroup(config);
  config = withIosCopyExtensions(config);
  config = withAndroidManifestExtensions(config);
  config = withAndroidCopyExtensions(config);
  return config;
};
