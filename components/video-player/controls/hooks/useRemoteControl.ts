import { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useTVBackPress } from "@/hooks/useTVBackPress";
import { useTVEventHandler } from "@/hooks/useTVEventHandler";

let TVEventControl: {
  enableTVMenuKey: () => void;
  disableTVMenuKey: () => void;
  enableTVPanGesture?: () => void;
  disableTVPanGesture?: () => void;
} | null = null;

if (Platform.isTV) {
  try {
    TVEventControl = require("react-native").TVEventControl;
  } catch {
    TVEventControl = null;
  }
}

interface UseRemoteControlProps {
  showControls: boolean;
  toggleControls: () => void;
  /** When true, disables handling D-pad events (e.g., when settings modal is open) */
  disableSeeking?: boolean;
  /** Callback for back/menu button press (tvOS: menu, Android TV: back) */
  onBack?: () => void;
  /** Callback to hide controls (called on back press when controls are visible) */
  onHideControls?: () => void;
  /** Title of the video being played (shown in exit confirmation) */
  videoTitle?: string;
  /** Whether the progress bar currently has focus */
  isProgressBarFocused?: boolean;
  /** Whether the progress bar is actively preview-scrubbing */
  isProgressBarScrubbing?: boolean;
  /** Callback when select/enter is pressed on the focused progress bar */
  onProgressBarPress?: () => void;
  /** Callback for touch-surface pan movement while scrubbing */
  onProgressScrubPan?: (deltaX: number) => void;
  /** Callback for seeking left when progress bar is focused */
  onSeekLeft?: () => void;
  /** Callback for seeking right when progress bar is focused */
  onSeekRight?: () => void;
  /** Callback for seeking left when controls are hidden (minimal seek mode) */
  onMinimalSeekLeft?: () => void;
  /** Callback for seeking right when controls are hidden (minimal seek mode) */
  onMinimalSeekRight?: () => void;
  /** Callback for any interaction that should reset the controls timeout */
  onInteraction?: () => void;
  /** Callback when long press seek left starts (eventKeyAction: 0) */
  onLongSeekLeftStart?: () => void;
  /** Callback when long press seek right starts (eventKeyAction: 0) */
  onLongSeekRightStart?: () => void;
  /** Callback when long press seek ends (eventKeyAction: 1) */
  onLongSeekStop?: () => void;
  /** Callback when up/down D-pad pressed (to show controls with play button focused) */
  onVerticalDpad?: () => void;
  /** Called before the exit confirmation Alert is shown (e.g., to pause countdown) */
  onWillExit?: () => void;
  /** Called when the user cancels the exit confirmation Alert */
  onCancelExit?: () => void;
  // Legacy props - kept for backwards compatibility with mobile Controls.tsx
  // These are ignored in the simplified implementation
  progress?: SharedValue<number>;
  min?: SharedValue<number>;
  max?: SharedValue<number>;
  isPlaying?: boolean;
  seek?: (value: number) => void;
  play?: () => void;
  togglePlay?: () => void;
  calculateTrickplayUrl?: (progressInTicks: number) => void;
  handleSeekForward?: (seconds: number) => void;
  handleSeekBackward?: (seconds: number) => void;
}

/**
 * Hook to manage TV remote control interactions.
 * Simplified version - D-pad navigation is handled by native focus system.
 * This hook handles:
 * - Showing controls on any button press
 * - Play/pause button on TV remote
 */
export function useRemoteControl({
  showControls,
  togglePlay,
  onBack,
  onHideControls,
  videoTitle,
  isProgressBarFocused,
  isProgressBarScrubbing,
  onProgressBarPress,
  onProgressScrubPan,
  onSeekLeft,
  onSeekRight,
  onMinimalSeekLeft,
  onMinimalSeekRight,
  onInteraction,
  onLongSeekLeftStart,
  onLongSeekRightStart,
  onLongSeekStop,
  onVerticalDpad,
  onWillExit,
  onCancelExit,
}: UseRemoteControlProps) {
  // Keep these for backward compatibility with the component
  const remoteScrubProgress = useSharedValue<number | null>(null);
  const isRemoteScrubbing = useSharedValue(false);
  const [showRemoteBubble] = useState(false);
  const [isSliding] = useState(false);
  const [time] = useState({ hours: 0, minutes: 0, seconds: 0 });

  // Use refs to avoid stale closures in BackHandler
  const showControlsRef = useRef(showControls);
  const onHideControlsRef = useRef(onHideControls);
  const onBackRef = useRef(onBack);
  const videoTitleRef = useRef(videoTitle);
  const onWillExitRef = useRef(onWillExit);
  const onCancelExitRef = useRef(onCancelExit);
  const isProgressBarScrubbingRef = useRef(isProgressBarScrubbing);
  const lastPanXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Platform.isTV || !TVEventControl) return;

    TVEventControl.enableTVMenuKey();
  }, []);

  useEffect(() => {
    showControlsRef.current = showControls;
    onHideControlsRef.current = onHideControls;
    onBackRef.current = onBack;
    videoTitleRef.current = videoTitle;
    onWillExitRef.current = onWillExit;
    onCancelExitRef.current = onCancelExit;
    isProgressBarScrubbingRef.current = isProgressBarScrubbing;
  }, [
    showControls,
    onHideControls,
    onBack,
    videoTitle,
    onWillExit,
    onCancelExit,
    isProgressBarScrubbing,
  ]);

  useEffect(() => {
    if (
      !Platform.isTV ||
      Platform.OS !== "ios" ||
      !TVEventControl?.enableTVPanGesture ||
      !TVEventControl?.disableTVPanGesture
    ) {
      return;
    }

    if (isProgressBarScrubbing) {
      TVEventControl.enableTVPanGesture();
      return () => {
        TVEventControl?.disableTVPanGesture?.();
        lastPanXRef.current = null;
      };
    }

    TVEventControl.disableTVPanGesture();
    lastPanXRef.current = null;
  }, [isProgressBarScrubbing]);

  // BackHandler owns player exit: Android TV sends hardware back here, and
  // react-native-tvos maps the Apple TV menu button to the same API.
  useTVBackPress(() => {
    if (isProgressBarScrubbingRef.current && onBackRef.current) {
      // Active progress scrubbing owns the first back press so both TV
      // platforms cancel scrubbing through the shared back/menu handler.
      onBackRef.current();
      return true;
    }

    if (showControlsRef.current && onHideControlsRef.current) {
      // Controls are visible, so the first back press only hides them.
      onHideControlsRef.current();
      return true;
    }
    if (onBackRef.current) {
      // Signal Controls that exit is imminent (pauses countdown, sets guard)
      onWillExitRef.current?.();

      // Controls are hidden, so confirm before leaving playback.
      Alert.alert(
        "Stop Playback",
        videoTitleRef.current
          ? `Stop playing "${videoTitleRef.current}"?`
          : "Are you sure you want to stop playback?",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => onCancelExitRef.current?.(),
          },
          { text: "Stop", style: "destructive", onPress: onBackRef.current },
        ],
      );
      return true;
    }
    return false;
  }, []);

  // TV remote control handling (no-op on non-TV platforms)
  useTVEventHandler((evt) => {
    if (!evt) return;

    // Back/menu is handled by useTVBackPress above. Keep this handler focused
    // on remote-control events like play/pause, D-pad, and long seek.
    if (evt.eventType === "menu" || evt.eventType === "back") {
      return;
    }

    // Handle play/pause button press on TV remote
    if (evt.eventType === "playPause") {
      togglePlay?.();
      onInteraction?.();
      return;
    }

    if (isProgressBarScrubbing) {
      if (evt.eventType === "pan") {
        const body = evt.body;
        if (!body) return;

        if (body.state === "Began") {
          lastPanXRef.current = body.x;
          return;
        }

        if (body.state === "Changed" && onProgressScrubPan) {
          const previousX = lastPanXRef.current ?? body.x;
          const deltaX = body.x - previousX;
          lastPanXRef.current = body.x;

          if (Math.abs(deltaX) >= 1) {
            onProgressScrubPan(deltaX);
          }
          return;
        }

        if (body.state === "Ended") {
          lastPanXRef.current = null;
          return;
        }

        return;
      }

      if (
        (evt.eventType === "select" || evt.eventType === "enter") &&
        onProgressBarPress
      ) {
        onProgressBarPress();
        return;
      }
      if (
        (evt.eventType === "longLeft" || evt.eventType === "left") &&
        onSeekLeft
      ) {
        if (evt.eventType === "left" || evt.eventKeyAction === 0) {
          onSeekLeft();
        }
        return;
      }
      if (
        (evt.eventType === "longRight" || evt.eventType === "right") &&
        onSeekRight
      ) {
        if (evt.eventType === "right" || evt.eventKeyAction === 0) {
          onSeekRight();
        }
        return;
      }
    }

    // Handle long press D-pad for continuous seeking (works in both modes)
    // Must be checked BEFORE the showControls check to work when controls are hidden
    if (evt.eventType === "longLeft") {
      if (evt.eventKeyAction === 0 && onLongSeekLeftStart) {
        // Key pressed - start continuous seeking backward
        onLongSeekLeftStart();
      } else if (evt.eventKeyAction === 1 && onLongSeekStop) {
        // Key released - stop seeking
        onLongSeekStop();
      }
      return;
    }

    if (evt.eventType === "longRight") {
      if (evt.eventKeyAction === 0 && onLongSeekRightStart) {
        // Key pressed - start continuous seeking forward
        onLongSeekRightStart();
      } else if (evt.eventKeyAction === 1 && onLongSeekStop) {
        // Key released - stop seeking
        onLongSeekStop();
      }
      return;
    }

    // Handle D-pad when controls are hidden
    if (!showControls) {
      // Minimal seek mode for left/right
      if (evt.eventType === "left" && onMinimalSeekLeft) {
        onMinimalSeekLeft();
        return;
      }
      if (evt.eventType === "right" && onMinimalSeekRight) {
        onMinimalSeekRight();
        return;
      }
      // Select toggles playback without opening controls.
      if (
        (evt.eventType === "select" || evt.eventType === "enter") &&
        togglePlay
      ) {
        togglePlay();
        onInteraction?.();
        return;
      }
      // Vertical navigation shows controls with play button focused.
      if (
        (evt.eventType === "up" ||
          evt.eventType === "down" ||
          evt.eventType === "swipeUp" ||
          evt.eventType === "swipeDown") &&
        onVerticalDpad
      ) {
        onVerticalDpad();
        return;
      }
      // Ignore all other events (focus/blur, swipes, etc.)
      // User can move vertically to show controls.
      return;
    }

    // Controls are showing - handle seeking when progress bar is focused
    if (isProgressBarFocused) {
      if (
        (evt.eventType === "select" || evt.eventType === "enter") &&
        onProgressBarPress
      ) {
        onProgressBarPress();
        return;
      }
      if (evt.eventType === "left" && onSeekLeft) {
        onSeekLeft();
        return;
      }
      if (evt.eventType === "right" && onSeekRight) {
        onSeekRight();
        return;
      }
    }

    // Reset the timeout on any D-pad navigation when controls are showing
    onInteraction?.();
  });

  return {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding,
    time,
  };
}
