import { useCallback, useEffect, useRef } from "react";

interface UseControlsTimeoutProps {
  showControls: boolean;
  isSliding: boolean;
  episodeView: boolean;
  onHideControls: () => void;
  timeout?: number;
  disabled?: boolean;
}

export const useControlsTimeout = ({
  showControls,
  isSliding,
  episodeView,
  onHideControls,
  timeout = 10000,
  disabled = false,
}: UseControlsTimeoutProps) => {
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resetControlsTimeout = () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      if (!disabled && showControls && !isSliding && !episodeView) {
        controlsTimeoutRef.current = setTimeout(() => {
          onHideControls();
        }, timeout);
      }
    };

    resetControlsTimeout();

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isSliding, episodeView, timeout, onHideControls, disabled]);

  const handleControlsInteraction = useCallback(() => {
    if (disabled || !showControls) return;

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      onHideControls();
    }, timeout);
  }, [disabled, showControls, onHideControls, timeout]);

  return {
    handleControlsInteraction,
  };
};
