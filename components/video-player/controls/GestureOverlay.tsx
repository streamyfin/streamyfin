import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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

const FEEDBACK_DISPLAY_DURATION_MS = 1000;

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
  const hideScheduledRef = useRef(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const lastUpdateTime = useRef(0);
  const accumulatedSeekTime = useRef(0);
  const lastDoubleTapSide = useRef<"left" | "right" | null>(null);

  const showFeedback = useCallback(
    (
      icon: string,
      text: string,
      side?: "left" | "right",
      isDuringDrag = false,
    ) => {
      requestAnimationFrame(() => {
        setFeedback({ visible: true, icon, text, side });

        if (!isDuringDrag) {
          // Ensure scheduled hide is cleared
          hideScheduledRef.current = false;

          Animated.sequence([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.delay(FEEDBACK_DISPLAY_DURATION_MS),
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]).start(() => {
            requestAnimationFrame(() => {
              setFeedback((prev) => ({ ...prev, visible: false }));
              // Reset accumulator when feedback hides
              accumulatedSeekTime.current = 0;
              lastDoubleTapSide.current = null;
            });
          });
        } else if (!isDraggingRef.current && !hideScheduledRef.current) {
          // Cancel any pending hide from a previous drag
          if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
          }
          hideScheduledRef.current = false;
          isDraggingRef.current = true;
          fadeAnim.stopAnimation();
          fadeAnim.setValue(1);
        }
      });
    },
    [fadeAnim],
  );

  const hideDragFeedback = useCallback(() => {
    isDraggingRef.current = false;
    hideScheduledRef.current = true;
    hideTimeoutRef.current = setTimeout(() => {
      fadeAnim.stopAnimation();
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        requestAnimationFrame(() => {
          setFeedback((prev) => ({ ...prev, visible: false }));
          hideScheduledRef.current = false;
        });
      });
    }, 100) as unknown as number;
  }, [fadeAnim]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

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

  // Keep track of feedback visibility in a ref to avoid dependency cycles
  const isFeedbackVisible = useRef(false);
  useEffect(() => {
    isFeedbackVisible.current = feedback.visible;
  }, [feedback.visible]);

  const handleDoubleTap = useCallback(
    (x: number) => {
      if (!settings.enableDoubleTapToSeek) return;
      lightHaptic();

      const side = x < screenWidth / 2 ? "left" : "right";
      const baseTime =
        side === "left" ? settings.rewindSkipTime : settings.forwardSkipTime;

      // Check if we should stack (same side and feedback is currently visible)
      if (lastDoubleTapSide.current === side && isFeedbackVisible.current) {
        accumulatedSeekTime.current += baseTime;
      } else {
        accumulatedSeekTime.current = baseTime;
        lastDoubleTapSide.current = side;
      }

      const text =
        side === "left"
          ? `-${accumulatedSeekTime.current}s`
          : `+${accumulatedSeekTime.current}s`;
      const icon = side === "left" ? "play-back" : "play-forward";

      requestAnimationFrame(() => {
        if (side === "left") {
          onSkipBackward();
        } else {
          onSkipForward();
        }
        showFeedback(icon, text, side);
      });
    },
    [
      settings.enableDoubleTapToSeek,
      settings.rewindSkipTime,
      settings.forwardSkipTime,
      screenWidth,
      onSkipBackward,
      onSkipForward,
      showFeedback,
      lightHaptic,
    ],
  );

  const { handleTouchStart, handleTouchMove, handleTouchEnd } =
    useGestureDetection({
      onSwipeLeft: handleSkipBackward,
      onSwipeRight: handleSkipForward,
      onVerticalDragStart: handleVerticalDragStart,
      onVerticalDragMove: handleVerticalDragMove,
      onVerticalDragEnd: handleVerticalDragEnd,
      onTap: onToggleControls,
      onDoubleTap: settings.enableDoubleTapToSeek ? handleDoubleTap : undefined,
      screenWidth,
      screenHeight,
    });

  // Determine styles based on controls visibility
  const overlayStyle = showControls
    ? {
        backgroundColor: "black",
        opacity: 0.75,
      }
    : {
        backgroundColor: "transparent",
      };

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
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          ...overlayStyle,
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
