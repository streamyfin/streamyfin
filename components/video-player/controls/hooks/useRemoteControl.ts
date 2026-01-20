import { useState } from "react";
import { Platform } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";

// TV event handler with fallback for non-TV platforms
let useTVEventHandler: (callback: (evt: any) => void) => void;
if (Platform.isTV) {
  try {
    useTVEventHandler = require("react-native").useTVEventHandler;
  } catch {
    // Fallback for non-TV platforms
    useTVEventHandler = () => {};
  }
} else {
  // No-op hook for non-TV platforms
  useTVEventHandler = () => {};
}

interface UseRemoteControlProps {
  showControls: boolean;
  toggleControls: () => void;
  /** When true, disables handling D-pad events (e.g., when settings modal is open) */
  disableSeeking?: boolean;
  /** Callback for back/menu button press (tvOS: menu, Android TV: back) */
  onBack?: () => void;
  /** Whether the progress bar currently has focus */
  isProgressBarFocused?: boolean;
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
  toggleControls,
  togglePlay,
  onBack,
  isProgressBarFocused,
  onSeekLeft,
  onSeekRight,
  onMinimalSeekLeft,
  onMinimalSeekRight,
  onInteraction,
  onLongSeekLeftStart,
  onLongSeekRightStart,
  onLongSeekStop,
  onVerticalDpad,
}: UseRemoteControlProps) {
  // Keep these for backward compatibility with the component
  const remoteScrubProgress = useSharedValue<number | null>(null);
  const isRemoteScrubbing = useSharedValue(false);
  const [showRemoteBubble] = useState(false);
  const [isSliding] = useState(false);
  const [time] = useState({ hours: 0, minutes: 0, seconds: 0 });

  // TV remote control handling (no-op on non-TV platforms)
  useTVEventHandler((evt) => {
    if (!evt) return;

    // Handle back/menu button press (tvOS: menu, Android TV: back)
    if (evt.eventType === "menu" || evt.eventType === "back") {
      if (onBack) {
        onBack();
      }
      return;
    }

    // Handle play/pause button press on TV remote
    if (evt.eventType === "playPause") {
      if (togglePlay) {
        togglePlay();
      }
      onInteraction?.();
      return;
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
      // Up/down shows controls with play button focused
      if (
        (evt.eventType === "up" || evt.eventType === "down") &&
        onVerticalDpad
      ) {
        onVerticalDpad();
        return;
      }
      // For other D-pad presses, show full controls
      toggleControls();
      return;
    }

    // Controls are showing - handle seeking when progress bar is focused
    if (isProgressBarFocused) {
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
