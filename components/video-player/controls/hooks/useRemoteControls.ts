import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useEffect, useRef, useState } from "react";
import { useTVEventHandler } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { useTrickplay } from "@/hooks/useTrickplay";
import { msToTicks, secondsToMs, ticksToSeconds } from "@/utils/time";

interface UseRemoteControlsProps {
  progress: SharedValue<number>;
  min: SharedValue<number>;
  max: SharedValue<number>;
  isVlc: boolean;
  showControls: boolean;
  isPlaying: boolean;
  item: BaseItemDto;
  seek: (ticks: number) => void;
  play: () => void;
  togglePlay: () => void;
  toggleControls: () => void;
}

export const useRemoteControls = ({
  progress,
  min,
  max,
  isVlc,
  showControls,
  isPlaying,
  item,
  seek,
  play,
  togglePlay,
  toggleControls,
}: UseRemoteControlsProps) => {
  const { calculateTrickplayUrl } = useTrickplay(item);

  const remoteScrubProgress = useRef<SharedValue<number | null>>(null);
  const isRemoteScrubbing = useRef<SharedValue<boolean>>(null);
  const SCRUB_INTERVAL = isVlc ? secondsToMs(10) : msToTicks(secondsToMs(10));
  const [showRemoteBubble, setShowRemoteBubble] = useState(false);
  const [longPressScrubMode, setLongPressScrubMode] = useState<
    "FF" | "RW" | null
  >(null);
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Initialize shared values if not provided
  if (!remoteScrubProgress.current) {
    remoteScrubProgress.current = { value: null } as SharedValue<number | null>;
  }
  if (!isRemoteScrubbing.current) {
    isRemoteScrubbing.current = { value: false } as SharedValue<boolean>;
  }

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
        isRemoteScrubbing.current!.value = true;
        setShowRemoteBubble(true);

        const direction = evt.eventType === "left" ? -1 : 1;
        const base = remoteScrubProgress.current!.value ?? progress.value;
        const updated = Math.max(
          min.value,
          Math.min(max.value, base + direction * SCRUB_INTERVAL),
        );
        remoteScrubProgress.current!.value = updated;
        const progressInTicks = isVlc ? msToTicks(updated) : updated;
        calculateTrickplayUrl(progressInTicks);
        const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
        const hours = Math.floor(progressInSeconds / 3600);
        const minutes = Math.floor((progressInSeconds % 3600) / 60);
        const seconds = progressInSeconds % 60;
        setTime({ hours, minutes, seconds });
        break;
      }
      case "select": {
        if (
          isRemoteScrubbing.current!.value &&
          remoteScrubProgress.current!.value != null
        ) {
          progress.value = remoteScrubProgress.current!.value;

          const seekTarget = isVlc
            ? Math.max(0, remoteScrubProgress.current!.value)
            : Math.max(0, ticksToSeconds(remoteScrubProgress.current!.value));

          seek(seekTarget);
          if (isPlaying) play();

          isRemoteScrubbing.current!.value = false;
          remoteScrubProgress.current!.value = null;
          setShowRemoteBubble(false);
        } else {
          togglePlay();
        }
        break;
      }
      case "down":
      case "up":
        // cancel scrubbing on other directions
        isRemoteScrubbing.current!.value = false;
        remoteScrubProgress.current!.value = null;
        setShowRemoteBubble(false);
        break;
      default:
        break;
    }

    if (!showControls) toggleControls();
  });

  const handleSeekBackward = (
    seconds: number,
    wasPlayingRef: React.MutableRefObject<boolean>,
  ) => {
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(seconds))
          : Math.max(0, ticksToSeconds(curr) - seconds);
        seek(newTime);
      }
    } catch (error) {
      console.error("Error seeking video backwards", error);
    }
  };

  const handleSeekForward = (
    seconds: number,
    wasPlayingRef: React.MutableRefObject<boolean>,
  ) => {
    wasPlayingRef.current = isPlaying;
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(seconds)
          : ticksToSeconds(curr) + seconds;
        seek(Math.max(0, newTime));
      }
    } catch (error) {
      console.error("Error seeking video forwards", error);
    }
  };

  // Long press scrubbing effect
  useEffect(() => {
    let isActive = true;
    let seekTime = 10;

    if (longPressScrubMode) {
      // Function is used, but eslint doesn't detect it inside setTimeout
      const scrubWithLongPress = (
        wasPlayingRef: React.MutableRefObject<boolean>,
      ) => {
        if (!isActive || !longPressScrubMode) return;

        const scrubFn =
          longPressScrubMode === "FF"
            ? (time: number) => handleSeekForward(time, wasPlayingRef)
            : (time: number) => handleSeekBackward(time, wasPlayingRef);

        scrubFn(seekTime);
        seekTime *= 1.1;

        longPressTimeoutRef.current = setTimeout(
          () => scrubWithLongPress(wasPlayingRef),
          300,
        );
      };

      // Start the scrubbing
      const wasPlayingRef = { current: isPlaying };
      scrubWithLongPress(wasPlayingRef);
    }

    return () => {
      isActive = false;
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    };
  }, [longPressScrubMode, handleSeekBackward, handleSeekForward, isPlaying]);

  return {
    remoteScrubProgress: remoteScrubProgress.current,
    isRemoteScrubbing: isRemoteScrubbing.current,
    showRemoteBubble,
    longPressScrubMode,
    time,
    handleSeekBackward,
    handleSeekForward,
  };
};
