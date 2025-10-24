import { useCallback, useEffect, useRef, useState } from "react";
import { useTVEventHandler } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "../constants";

interface UseRemoteControlProps {
  progress: SharedValue<number>;
  min: SharedValue<number>;
  max: SharedValue<number>;
  isVlc: boolean;
  showControls: boolean;
  isPlaying: boolean;
  seek: (value: number) => void;
  play: () => void;
  togglePlay: () => void;
  toggleControls: () => void;
  calculateTrickplayUrl: (progressInTicks: number) => void;
  handleSeekForward: (seconds: number) => void;
  handleSeekBackward: (seconds: number) => void;
}

export function useRemoteControl({
  progress,
  min,
  max,
  isVlc,
  showControls,
  isPlaying,
  seek,
  play,
  togglePlay,
  toggleControls,
  calculateTrickplayUrl,
  handleSeekForward,
  handleSeekBackward,
}: UseRemoteControlProps) {
  const remoteScrubProgress = useSharedValue<number | null>(null);
  const isRemoteScrubbing = useSharedValue(false);
  const [showRemoteBubble, setShowRemoteBubble] = useState(false);
  const [longPressScrubMode, setLongPressScrubMode] = useState<
    "FF" | "RW" | null
  >(null);
  const [isSliding, setIsSliding] = useState(false);
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const SCRUB_INTERVAL = isVlc
    ? CONTROLS_CONSTANTS.SCRUB_INTERVAL_MS
    : CONTROLS_CONSTANTS.SCRUB_INTERVAL_TICKS;

  const updateTime = useCallback(
    (progressValue: number) => {
      const progressInTicks = isVlc ? msToTicks(progressValue) : progressValue;
      const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    },
    [isVlc],
  );

  useTVEventHandler((evt) => {
    if (!evt) return;

    switch (evt.eventType) {
      case "longLeft": {
        setLongPressScrubMode((prev) => (!prev ? "RW" : null));
        break;
      }
      case "longRight": {
        setLongPressScrubMode((prev) => (!prev ? "FF" : null));
        break;
      }
      case "left":
      case "right": {
        isRemoteScrubbing.value = true;
        setShowRemoteBubble(true);

        const direction = evt.eventType === "left" ? -1 : 1;
        const base = remoteScrubProgress.value ?? progress.value;
        const updated = Math.max(
          min.value,
          Math.min(max.value, base + direction * SCRUB_INTERVAL),
        );
        remoteScrubProgress.value = updated;
        const progressInTicks = isVlc ? msToTicks(updated) : updated;
        calculateTrickplayUrl(progressInTicks);
        updateTime(updated);
        break;
      }
      case "select": {
        if (isRemoteScrubbing.value && remoteScrubProgress.value != null) {
          progress.value = remoteScrubProgress.value;

          const seekTarget = isVlc
            ? Math.max(0, remoteScrubProgress.value)
            : Math.max(0, ticksToSeconds(remoteScrubProgress.value));

          seek(seekTarget);
          if (isPlaying) play();

          isRemoteScrubbing.value = false;
          remoteScrubProgress.value = null;
          setShowRemoteBubble(false);
        } else {
          togglePlay();
        }
        break;
      }
      case "down":
      case "up":
        // cancel scrubbing on other directions
        isRemoteScrubbing.value = false;
        remoteScrubProgress.value = null;
        setShowRemoteBubble(false);
        break;
      default:
        break;
    }

    if (!showControls) toggleControls();
  });

  useEffect(() => {
    let isActive = true;
    let seekTime = CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK;

    const scrubWithLongPress = () => {
      if (!isActive || !longPressScrubMode) return;

      setIsSliding(true);
      const scrubFn =
        longPressScrubMode === "FF" ? handleSeekForward : handleSeekBackward;
      scrubFn(seekTime);
      seekTime *= CONTROLS_CONSTANTS.LONG_PRESS_ACCELERATION;

      longPressTimeoutRef.current = setTimeout(
        scrubWithLongPress,
        CONTROLS_CONSTANTS.LONG_PRESS_INTERVAL,
      );
    };

    if (longPressScrubMode) {
      isActive = true;
      scrubWithLongPress();
    }

    return () => {
      isActive = false;
      setIsSliding(false);
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    };
  }, [longPressScrubMode, handleSeekForward, handleSeekBackward]);

  return {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    longPressScrubMode,
    isSliding,
    time,
  };
}
