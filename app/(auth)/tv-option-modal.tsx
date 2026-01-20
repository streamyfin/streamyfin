import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";
import { TVOptionCard } from "@/components/tv";
import useRouter from "@/hooks/useAppRouter";
import { tvOptionModalAtom } from "@/utils/atoms/tvOptionModal";
import { store } from "@/utils/store";

export default function TVOptionModal() {
  const router = useRouter();
  const modalState = useAtomValue(tvOptionModalAtom);

  const [isReady, setIsReady] = useState(false);
  const firstCardRef = useRef<View>(null);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(200)).current;

  const initialSelectedIndex = useMemo(() => {
    if (!modalState?.options) return 0;
    const idx = modalState.options.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [modalState?.options]);

  // Animate in on mount and cleanup atom on unmount
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

    // Delay focus setup to allow layout
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => {
      clearTimeout(timer);
      // Clear the atom on unmount to prevent stale callbacks from being retained
      store.set(tvOptionModalAtom, null);
    };
  }, [overlayOpacity, sheetTranslateY]);

  // Request focus on the first card when ready
  useEffect(() => {
    if (isReady && firstCardRef.current) {
      const timer = setTimeout(() => {
        (firstCardRef.current as any)?.requestTVFocus?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  const handleSelect = (value: any) => {
    modalState?.onSelect(value);
    store.set(tvOptionModalAtom, null);
    router.back();
  };

  // If no modal state, just go back (shouldn't happen in normal usage)
  if (!modalState) {
    return null;
  }

  const { title, options, cardWidth = 160, cardHeight = 75 } = modalState;

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
            <Text style={styles.title}>{title}</Text>
            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
              >
                {options.map((option, index) => (
                  <TVOptionCard
                    key={index}
                    ref={
                      index === initialSelectedIndex ? firstCardRef : undefined
                    }
                    label={option.label}
                    sublabel={option.sublabel}
                    selected={option.selected}
                    hasTVPreferredFocus={index === initialSelectedIndex}
                    onPress={() => handleSelect(option.value)}
                    width={cardWidth}
                    height={cardHeight}
                  />
                ))}
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
});
