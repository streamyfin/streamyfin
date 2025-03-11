import React, { useEffect, useState } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { TVFocusable } from "../../common/TVFocusable";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../../common/Text";
import { formatTimeString } from "@/utils/time";

interface TVControlsOverlayProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onClose: () => void;
  forwardSkipTime?: number;
  rewindSkipTime?: number;
  showControls: boolean;
  currentTime: number;
  duration: number;
  onControlsHide: () => void;
}

const CONTROLS_TIMEOUT = 5000; // 5 seconds

export const TVControlsOverlay: React.FC<TVControlsOverlayProps> = ({
  isPlaying,
  onPlayPause,
  onSkipForward,
  onSkipBackward,
  onClose,
  forwardSkipTime = 30,
  rewindSkipTime = 10,
  showControls,
  currentTime,
  duration,
  onControlsHide,
}) => {
  const [controlsTimer, setControlsTimer] = useState<NodeJS.Timeout | null>(
    null,
  );

  // Reset the timer whenever controls are shown
  useEffect(() => {
    if (showControls) {
      if (controlsTimer) clearTimeout(controlsTimer);
      const timer = setTimeout(() => {
        onControlsHide();
      }, CONTROLS_TIMEOUT);
      setControlsTimer(timer);
    }
    return () => {
      if (controlsTimer) clearTimeout(controlsTimer);
    };
  }, [showControls, onControlsHide]);

  // Reset timer on any interaction
  const resetTimer = () => {
    if (controlsTimer) clearTimeout(controlsTimer);
    const timer = setTimeout(() => {
      onControlsHide();
    }, CONTROLS_TIMEOUT);
    setControlsTimer(timer);
  };

  if (!showControls) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Progress bar at the bottom */}
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTimeString(currentTime)}</Text>
          <Text style={styles.timeText}>
            -{formatTimeString(duration - currentTime)}
          </Text>
        </View>
      </View>

      {/* Controls in the center */}
      <View style={styles.controlsRow}>
        <TVFocusable
          onSelect={() => {
            resetTimer();
            onSkipBackward();
          }}
          onFocus={resetTimer}
        >
          <View style={styles.controlButton}>
            <Ionicons
              name="refresh-outline"
              size={40}
              color="white"
              style={{
                transform: [{ scaleY: -1 }, { rotate: "180deg" }],
              }}
            />
            <Text style={styles.skipText}>{rewindSkipTime}</Text>
          </View>
        </TVFocusable>

        <TVFocusable
          onSelect={() => {
            resetTimer();
            onPlayPause();
          }}
          onFocus={resetTimer}
          hasTVPreferredFocus={true}
        >
          <View style={[styles.controlButton, styles.playButton]}>
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={50}
              color="white"
            />
          </View>
        </TVFocusable>

        <TVFocusable
          onSelect={() => {
            resetTimer();
            onSkipForward();
          }}
          onFocus={resetTimer}
        >
          <View style={styles.controlButton}>
            <Ionicons name="refresh-outline" size={40} color="white" />
            <Text style={styles.skipText}>{forwardSkipTime}</Text>
          </View>
        </TVFocusable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    gap: 40,
  },
  controlButton: {
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  playButton: {
    padding: 20,
    backgroundColor: "rgba(139, 92, 246, 0.5)", // Purple with opacity
  },
  skipText: {
    position: "absolute",
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    bottom: 10,
  },
  progressBarContainer: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    height: 40,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#8b5cf6",
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  timeText: {
    color: "white",
    fontSize: 14,
  },
});
