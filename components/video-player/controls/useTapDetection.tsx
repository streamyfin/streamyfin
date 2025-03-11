import { useRef } from "react";
import { GestureResponderEvent } from "react-native";

interface TapDetectionOptions {
  maxDuration?: number;
  maxDistance?: number;
  onValidTap?: () => void;
}

export const useTapDetection = ({
  maxDuration = 200,
  maxDistance = 10,
  onValidTap,
}: TapDetectionOptions = {}) => {
  const touchStartTime = useRef(0);
  const touchStartPosition = useRef({ x: 0, y: 0 });

  const handleTouchStart = (event: GestureResponderEvent) => {
    touchStartTime.current = Date.now();
    touchStartPosition.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const touchEndTime = Date.now();
    const touchEndPosition = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };

    const touchDuration = touchEndTime - touchStartTime.current;
    const touchDistance = Math.sqrt(
      Math.pow(touchEndPosition.x - touchStartPosition.current.x, 2) +
        Math.pow(touchEndPosition.y - touchStartPosition.current.y, 2),
    );

    if (touchDuration < maxDuration && touchDistance < maxDistance) {
      onValidTap?.();
    }
  };

  return {
    handleTouchStart,
    handleTouchEnd,
  };
};
