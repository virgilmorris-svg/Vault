import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { theme } from "@/src/lib/theme";

/**
 * Face-Lit Splash: the VauLt safe scales in, wobbles like a door opening,
 * a bright sky-blue halo pulses out, then the whole thing fades to reveal the app.
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const scale = useSharedValue(0.55);
  const rot = useSharedValue(-12);
  const halo = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.exp) });
    rot.value = withSequence(
      withTiming(6, { duration: 350, easing: Easing.out(Easing.quad) }),
      withTiming(-3, { duration: 220, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 200, easing: Easing.inOut(Easing.quad) }),
    );
    halo.value = withDelay(200, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(1600, withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.6 - halo.value * 0.6,
    transform: [{ scale: 0.6 + halo.value * 1.8 }],
  }));
  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.root, containerStyle]} pointerEvents="none" testID="animated-splash">
      <Animated.View style={[styles.halo, haloStyle]} />
      <Animated.View style={logoStyle}>
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
          contentFit="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.color.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logo: { width: 180, height: 180, borderRadius: 32 },
  halo: {
    position: "absolute",
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: theme.color.brand,
    shadowColor: theme.color.brand,
    shadowRadius: 60,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 0 },
  },
});
