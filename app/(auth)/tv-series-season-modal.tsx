import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { TVCancelButton, TVOptionCard } from "@/components/tv";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { tvSeriesSeasonModalAtom } from "@/utils/atoms/tvSeriesSeasonModal";
import { store } from "@/utils/store";

export default function TVSeriesSeasonModalPage() {
  const typography = useScaledTVTypography();
  const router = useRouter();
  const modalState = useAtomValue(tvSeriesSeasonModalAtom);
  const { t } = useTranslation();

  const [isReady, setIsReady] = useState(false);
  const firstCardRef = useRef<View>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  const initialSelectedIndex = useMemo(() => {
    if (!modalState?.seasons) return 0;
    const idx = modalState.seasons.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [modalState?.seasons]);

  // Animate in on mount
  useEffect(() => {
    overlayOpacity.setValue(0);
    sheetTranslateY.setValue(200);

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

    const timer = setTimeout(() => setIsReady(true), 100);
    return () => {
      clearTimeout(timer);
      store.set(tvSeriesSeasonModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  // Focus on the selected card when ready
  useEffect(() => {
    if (isReady && firstCardRef.current) {
      const timer = setTimeout(() => {
        (firstCardRef.current as any)?.requestTVFocus?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  const handleSelect = (seasonIndex: number) => {
    if (modalState?.onSeasonSelect) {
      modalState.onSeasonSelect(seasonIndex);
    }
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

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
            <Text style={[styles.title, { fontSize: typography.callout }]}>
              {t("item_card.select_season")}
            </Text>

            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
              >
                {modalState.seasons.map((season, index) => (
                  <TVOptionCard
                    key={season.value}
                    ref={
                      index === initialSelectedIndex ? firstCardRef : undefined
                    }
                    label={season.label}
                    selected={season.selected}
                    hasTVPreferredFocus={index === initialSelectedIndex}
                    onPress={() => handleSelect(season.value)}
                    width={180}
                    height={85}
                  />
                ))}
              </ScrollView>
            )}

            {isReady && (
              <View style={styles.cancelButtonContainer}>
                <TVCancelButton
                  onPress={handleCancel}
                  label={t("common.cancel")}
                />
              </View>
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
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    paddingHorizontal: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 20,
    gap: 12,
  },
  cancelButtonContainer: {
    marginTop: 16,
    paddingHorizontal: 48,
    alignItems: "flex-start",
  },
});
