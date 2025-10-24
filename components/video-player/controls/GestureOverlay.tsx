import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import { Animated, Pressable } from "react-native";
import { Text } from "@/components/common/Text";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings } from "@/utils/atoms/settings";
import { useGestureDetection } from "./hooks/useGestureDetection";
import { useVolumeAndBrightness } from "./hooks/useVolumeAndBrightness";

interface Props {
  screenWidth: number;
  screenHeight: number;
  showControls: boolean;
  onToggleControls: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
}

interface FeedbackState {
  visible: boolean;
  icon: string;
  text: string;
  side?: "left" | "right";
}

export const GestureOverlay = ({
  screenWidth,
  screenHeight,
  showControls,
  onToggleControls,
  onSkipForward,
  onSkipBackward,
}: Props) => {
  const { settings } = useSettings();
  const lightHaptic = useHaptic("light");

  const [feedback, setFeedback] = useState<FeedbackState>({
    visible: false,
    icon: "",
    text: "",
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const isDraggingRef = useRef(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(0);

  const showFeedback = useCallback(
    (
      icon: string,
      text: string,
      side?: "left" | "right",
      isDuringDrag = false,
    ) => {
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      // Defer ALL state updates to avoid useInsertionEffect warning
      requestAnimationFrame(() => {
        setFeedback({ visible: true, icon, text, side });

        if (!isDuringDrag) {
          // For discrete actions (like skip), show normal animation
          Animated.sequence([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.delay(1000),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            requestAnimationFrame(() => {
              setFeedback((prev) => ({ ...prev, visible: false }));
            });
          });
        } else if (!isDraggingRef.current) {
          // For drag start, just fade in and stay visible
          isDraggingRef.current = true;
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
        // For drag updates, just update the state, don't restart animation
      });
    },
    [fadeAnim],
  );

  const hideDragFeedback = useCallback(() => {
    isDraggingRef.current = false;

    // Delay hiding slightly to avoid flicker
    hideTimeoutRef.current = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        requestAnimationFrame(() => {
          setFeedback((prev) => ({ ...prev, visible: false }));
        });
      });
    }, 100) as unknown as number;
  }, [fadeAnim]);

  const {
    startVolumeDrag,
    updateVolumeDrag,
    endVolumeDrag,
    startBrightnessDrag,
    updateBrightnessDrag,
    endBrightnessDrag,
  } = useVolumeAndBrightness({
    onVolumeChange: (volume: number) => {
      // Throttle feedback updates during dragging to reduce callback frequency
      const now = Date.now();
      if (now - lastUpdateTime.current < 50) return; // 50ms throttle
      lastUpdateTime.current = now;

      // Defer feedback update to avoid useInsertionEffect warning
      requestAnimationFrame(() => {
        showFeedback("volume-high", `${volume}%`, "right", true);
      });
    },
    onBrightnessChange: (brightness: number) => {
      // Throttle feedback updates during dragging to reduce callback frequency
      const now = Date.now();
      if (now - lastUpdateTime.current < 50) return; // 50ms throttle
      lastUpdateTime.current = now;

      // Defer feedback update to avoid useInsertionEffect warning
      requestAnimationFrame(() => {
        showFeedback("sunny", `${brightness}%`, "left", true);
      });
    },
  });

  const handleSkipForward = useCallback(() => {
    if (!settings.enableHorizontalSwipeSkip) return;
    lightHaptic();
    // Defer all actions to avoid useInsertionEffect warning
    requestAnimationFrame(() => {
      onSkipForward();
      showFeedback("play-forward", `+${settings.forwardSkipTime}s`);
    });
  }, [
    settings.enableHorizontalSwipeSkip,
    settings.forwardSkipTime,
    lightHaptic,
    onSkipForward,
    showFeedback,
  ]);

  const handleSkipBackward = useCallback(() => {
    if (!settings.enableHorizontalSwipeSkip) return;
    lightHaptic();
    // Defer all actions to avoid useInsertionEffect warning
    requestAnimationFrame(() => {
      onSkipBackward();
      showFeedback("play-back", `-${settings.rewindSkipTime}s`);
    });
  }, [
    settings.enableHorizontalSwipeSkip,
    settings.rewindSkipTime,
    lightHaptic,
    onSkipBackward,
    showFeedback,
  ]);

  const handleVerticalDragStart = useCallback(
    (side: "left" | "right", startY: number) => {
      if (side === "left" && settings.enableLeftSideBrightnessSwipe) {
        lightHaptic();
        // Defer drag start to avoid useInsertionEffect warning
        requestAnimationFrame(() => {
          startBrightnessDrag(startY);
        });
      } else if (side === "right" && settings.enableRightSideVolumeSwipe) {
        lightHaptic();
        // Defer drag start to avoid useInsertionEffect warning
        requestAnimationFrame(() => {
          startVolumeDrag(startY);
        });
      }
    },
    [
      settings.enableLeftSideBrightnessSwipe,
      settings.enableRightSideVolumeSwipe,
      lightHaptic,
      startBrightnessDrag,
      startVolumeDrag,
    ],
  );

  const handleVerticalDragMove = useCallback(
    (side: "left" | "right", deltaY: number) => {
      // Use requestAnimationFrame to defer drag move updates too
      requestAnimationFrame(() => {
        if (side === "left" && settings.enableLeftSideBrightnessSwipe) {
          updateBrightnessDrag(deltaY);
        } else if (side === "right" && settings.enableRightSideVolumeSwipe) {
          updateVolumeDrag(deltaY);
        }
      });
    },
    [
      settings.enableLeftSideBrightnessSwipe,
      settings.enableRightSideVolumeSwipe,
      updateBrightnessDrag,
      updateVolumeDrag,
    ],
  );

  const handleVerticalDragEnd = useCallback(
    (side: "left" | "right") => {
      // Defer drag end to avoid useInsertionEffect warning
      requestAnimationFrame(() => {
        if (side === "left") {
          endBrightnessDrag();
        } else {
          endVolumeDrag();
        }
        hideDragFeedback();
      });
    },
    [endBrightnessDrag, endVolumeDrag, hideDragFeedback],
  );

  const { handleTouchStart, handleTouchMove, handleTouchEnd } =
    useGestureDetection({
      onSwipeLeft: handleSkipBackward,
      onSwipeRight: handleSkipForward,
      onVerticalDragStart: handleVerticalDragStart,
      onVerticalDragMove: handleVerticalDragMove,
      onVerticalDragEnd: handleVerticalDragEnd,
      onTap: onToggleControls,
      screenWidth,
      screenHeight,
    });

  // If controls are visible, act like the old tap overlay
  if (showControls) {
    return (
      <Pressable
        onPress={onToggleControls}
        style={{
          position: "absolute",
          width: screenWidth,
          height: screenHeight,
          backgroundColor: "black",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          opacity: 0.75,
        }}
      />
    );
  }

  return (
    <>
      {/* Gesture detection area */}
      <Pressable
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "absolute",
          width: screenWidth,
          height: screenHeight,
          backgroundColor: "transparent",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        }}
      />

      {/* Feedback overlay */}
      {feedback.visible && (
        <Animated.View
          style={{
            position: "absolute",
            top: "50%",
            left:
              feedback.side === "left"
                ? "20%"
                : feedback.side === "right"
                  ? "80%"
                  : "50%",
            transform: [
              { translateY: -25 },
              {
                translateX:
                  feedback.side === "right"
                    ? -50
                    : feedback.side === "left"
                      ? 0
                      : -50,
              },
            ],
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 8,
            flexDirection: "row",
            alignItems: "center",
            opacity: fadeAnim,
            zIndex: 20,
          }}
        >
          <Ionicons
            name={feedback.icon as any}
            size={24}
            color='white'
            style={{ marginRight: 8 }}
          />
          <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
            {feedback.text}
          </Text>
        </Animated.View>
      )}
    </>
  );
};
