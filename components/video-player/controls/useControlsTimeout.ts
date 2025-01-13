import { useEffect, useRef } from "react";

interface UseControlsTimeoutProps {
  showControls: boolean;
  isSliding: boolean;
  episodeView: boolean;
  onHideControls: () => void;
  timeout?: number;
}

export const useControlsTimeout = ({
  showControls,
  isSliding,
  episodeView,
  onHideControls,
  timeout = 4000,
}: UseControlsTimeoutProps) => {
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const resetControlsTimeout = () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      if (showControls && !isSliding && !episodeView) {
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
  }, [showControls, isSliding, episodeView, timeout, onHideControls]);

  const handleControlsInteraction = () => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        onHideControls();
      }, timeout);
    }
  };

  return {
    handleControlsInteraction,
  };
};
