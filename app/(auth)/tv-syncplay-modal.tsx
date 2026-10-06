import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, TVFocusGuideView } from "react-native";
import { TVSyncPlaySheet } from "@/components/syncplay/TVSyncPlaySheet";
import useRouter from "@/hooks/useAppRouter";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { tvSyncPlayModalAtom } from "@/utils/atoms/tvSyncPlayModal";
import { scaleSize } from "@/utils/scaleSize";
import { store } from "@/utils/store";

/**
 * SyncPlay on TV, as a sheet over the page it was opened from. A route and
 * not an overlay: only a route gets the remote's back button.
 */
export default function TVSyncPlayModal() {
  const router = useRouter();
  const seed = useAtomValue(tvSyncPlayModalAtom);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    return () => store.set(tvSyncPlayModalAtom, null);
  }, [overlayOpacity, sheetTranslateY]);

  const close = useCallback(() => router.back(), [router]);

  useTVBackPress(() => {
    close();
    return true;
  }, [close]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
        <BlurView intensity={80} tint='dark' style={styles.blur}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            <TVSyncPlaySheet seed={seed} onClose={close} />
          </TVFocusGuideView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  blur: {
    borderTopLeftRadius: scaleSize(24),
    borderTopRightRadius: scaleSize(24),
    overflow: "hidden",
  },
  content: {
    paddingTop: scaleSize(32),
    paddingBottom: scaleSize(50),
    overflow: "visible",
  },
});
