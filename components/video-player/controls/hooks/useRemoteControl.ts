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
      return;
    }

    // Show controls on any D-pad press
    if (!showControls) {
      toggleControls();
    }
  });

  return {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding,
    time,
  };
}
