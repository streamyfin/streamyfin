import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVUserCard } from "@/components/tv/TVUserCard";
import { TVSheetTiming } from "@/constants/TVSheet";
import useRouter from "@/hooks/useAppRouter";
import { tvUserSwitchModalAtom } from "@/utils/atoms/tvUserSwitchModal";
import type { SavedServerAccount } from "@/utils/secureCredentials";
import { store } from "@/utils/store";
import { createSubmission } from "@/utils/submission";

// Spec: hooks/useTVUserSwitchModal.test.tsx. It cannot sit next to this file,
// Expo Router turns everything under app/ into a route.
export default function TVUserSwitchModalPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const modalState = useAtomValue(tvUserSwitchModalAtom);

  const [isReady, setIsReady] = useState(false);
  const firstCardRef = useRef<View>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;
  // Android TV can deliver one remote select twice in the same JS batch
  // (react-native-tvos#110/#138, see useAppRouter): the sheet closes once, or
  // the second router.back() pops the screen under it as well.
  const submission = useRef(createSubmission()).current;

  // Animate in on mount and cleanup atom on unmount
  useEffect(() => {
    submission.show();
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(200);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: TVSheetTiming.fadeInMs,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: TVSheetTiming.slideInMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Delay focus setup to allow layout
    const timer = setTimeout(
      () => setIsReady(true),
      TVSheetTiming.contentDelayMs,
    );
    return () => {
      clearTimeout(timer);
      submission.dismiss();
      // Clear the atom on unmount to prevent stale callbacks from being retained
      store.set(tvUserSwitchModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY, submission]);

  // Request focus on the first card when ready
  useEffect(() => {
    if (isReady && firstCardRef.current) {
      const timer = setTimeout(() => {
        (firstCardRef.current as any)?.requestTVFocus?.();
      }, TVSheetTiming.focusDelayMs);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  const handleSelect = (account: SavedServerAccount) => {
    if (!modalState || !submission.dismiss()) return;
    modalState.onAccountSelect(account);
    store.set(tvUserSwitchModalAtom, null);
    router.back();
  };

  // If no modal state, just return null
  if (!modalState) {
    return null;
  }

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Animated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <BlurView intensity={80} tint='dark' style={styles.blurContainer}>
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.content}
          >
            <Text style={styles.title}>
              {t("home.settings.switch_user.title")}
            </Text>
            <Text style={styles.subtitle}>{modalState.serverName}</Text>
            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
              >
                {modalState.accounts.map((account, index) => {
                  const isCurrent = account.userId === modalState.currentUserId;
                  return (
                    <TVUserCard
                      key={account.userId}
                      ref={index === 0 ? firstCardRef : undefined}
                      username={account.username}
                      securityType={account.securityType}
                      hasTVPreferredFocus={index === 0}
                      isCurrent={isCurrent}
                      onPress={() => handleSelect(account)}
                    />
                  );
                })}
              </ScrollView>
            )}
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
  sheetContainer: {
    width: "100%",
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 50,
    overflow: "visible",
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
    paddingHorizontal: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 16,
    paddingHorizontal: 48,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 20,
    gap: 16,
  },
});
