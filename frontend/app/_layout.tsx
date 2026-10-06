import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { VaultProvider } from "@/src/lib/vault";
import { AnimatedSplash } from "@/src/components/AnimatedSplash";
import { LanguageProvider } from "@/src/lib/i18n";


LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function DeepLinkBridge() {
  const router = useRouter();
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      // vault://quick-copy       → open Quick Copy
      // vault://autofill?domain=…  → open Quick Copy (filtered by domain via URL param)
      if (/quick-copy|autofill/i.test(url)) {
        const domain = (url.match(/[?&]domain=([^&]+)/) || [])[1];
        router.push({ pathname: "/quick-copy", params: domain ? { domain: decodeURIComponent(domain) } : {} } as any);
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#09090B" }}>
      <LanguageProvider>
        <VaultProvider>
          <DeepLinkBridge />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#09090B" } }} />
          {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
        </VaultProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
