import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useTVEventHandler } from "@/hooks/useTVEventHandler";

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
  onHideControls,
  videoTitle,
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

  // Use refs to avoid stale closures in BackHandler
  const showControlsRef = useRef(showControls);
  const onHideControlsRef = useRef(onHideControls);
  const onBackRef = useRef(onBack);
  const videoTitleRef = useRef(videoTitle);

  useEffect(() => {
    showControlsRef.current = showControls;
    onHideControlsRef.current = onHideControls;
    onBackRef.current = onBack;
    videoTitleRef.current = videoTitle;
  }, [showControls, onHideControls, onBack, videoTitle]);

  // Handle hardware back button (works on both Android TV and tvOS)
  useEffect(() => {
    if (!Platform.isTV) return;

    const handleBackPress = () => {
      if (showControlsRef.current && onHideControlsRef.current) {
        // Controls are visible - just hide them
        onHideControlsRef.current();
        return true; // Prevent default back navigation
      }
      if (onBackRef.current) {
        // Controls are hidden - show confirmation before exiting
        Alert.alert(
          "Stop Playback",
          videoTitleRef.current
            ? `Stop playing "${videoTitleRef.current}"?`
            : "Are you sure you want to stop playback?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Stop", style: "destructive", onPress: onBackRef.current },
          ],
        );
        return true; // Prevent default back navigation
      }
      return false; // Let default back navigation happen
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );

    return () => subscription.remove();
  }, []);

  // TV remote control handling (no-op on non-TV platforms)
  useTVEventHandler((evt) => {
    if (!evt) return;

    // Back/menu is handled by BackHandler above, but keep this for tvOS menu button
    if (evt.eventType === "menu") {
      if (showControls && onHideControls) {
        onHideControls();
      } else if (onBack) {
        Alert.alert(
          "Stop Playback",
          videoTitle
            ? `Stop playing "${videoTitle}"?`
            : "Are you sure you want to stop playback?",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Stop", style: "destructive", onPress: onBack },
          ],
        );
      }
      return;
    }

    // Handle play/pause button press on TV remote
    if (evt.eventType === "playPause") {
      togglePlay?.();
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
      // Ignore select/enter events - let the native Pressable handle them
      // This prevents controls from showing when pressing buttons like skip intro
      if (evt.eventType === "select" || evt.eventType === "enter") {
        return;
      }
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
      // Ignore all other events (focus/blur, swipes, etc.)
      // User can press up/down to show controls
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
