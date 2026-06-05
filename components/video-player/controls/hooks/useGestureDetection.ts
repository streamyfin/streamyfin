import { useCallback, useRef } from "react";
import type { GestureResponderEvent } from "react-native";

export interface SwipeGestureOptions {
  minDistance?: number;
  maxDuration?: number;
  onDoubleTapLeft?: () => void;
  onDoubleTapRight?: () => void;
  onVerticalDragStart?: (side: "left" | "right", initialY: number) => void;
  onVerticalDragMove?: (
    side: "left" | "right",
    deltaY: number,
    currentY: number,
  ) => void;
  onVerticalDragEnd?: (side: "left" | "right") => void;
  onTap?: () => void;
  screenWidth?: number;
  screenHeight?: number;
}

export const useGestureDetection = ({
  minDistance = 50,
  maxDuration = 800,
  onDoubleTapLeft,
  onDoubleTapRight,
  onVerticalDragStart,
  onVerticalDragMove,
  onVerticalDragEnd,
  onTap,
  screenWidth = 400,
  screenHeight = 800,
}: SwipeGestureOptions = {}) => {
  const touchStartTime = useRef(0);
  const touchStartPosition = useRef({ x: 0, y: 0 });
  const lastTouchPosition = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragSide = useRef<"left" | "right" | null>(null);
  const hasMovedEnough = useRef(false);
  const gestureType = useRef<"none" | "horizontal" | "vertical">("none");
  const shouldIgnoreTouch = useRef(false);

  // Double tap detection refs
  const lastTapTime = useRef(0);
  const lastTapPosition = useRef({ x: 0, y: 0 });
  const doubleTapTimeWindow = 300; // 300ms window for double tap

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      const startY = event.nativeEvent.pageY;

      // Define exclusion zones (15% from top and bottom)
      const topExclusionZone = screenHeight * 0.15;
      const bottomExclusionZone = screenHeight * 0.85;

      // Check if touch started in exclusion zones
      if (startY < topExclusionZone || startY > bottomExclusionZone) {
        shouldIgnoreTouch.current = true;
        return;
      }

      shouldIgnoreTouch.current = false;
      touchStartTime.current = Date.now();
      touchStartPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      lastTouchPosition.current = {
        x: event.nativeEvent.pageX,
        y: startY,
      };
      isDragging.current = false;
      dragSide.current = null;
      hasMovedEnough.current = false;
      gestureType.current = "none";
    },
    [screenHeight],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        return;
      }

      const currentPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const deltaX = currentPosition.x - touchStartPosition.current.x;
      const deltaY = currentPosition.y - touchStartPosition.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Lower threshold for starting gestures - make it more sensitive
      if (!hasMovedEnough.current && totalDistance > 8) {
        hasMovedEnough.current = true;

        // Determine gesture type based on initial movement direction
        if (absY > absX && absY > 5) {
          // Vertical gesture - start drag immediately
          gestureType.current = "vertical";
          const side =
            touchStartPosition.current.x < screenWidth / 2 ? "left" : "right";
          isDragging.current = true;
          dragSide.current = side;
          onVerticalDragStart?.(side, touchStartPosition.current.y);
        }
      }

      // Continue vertical drag if already dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        const deltaFromStart = currentPosition.y - touchStartPosition.current.y;
        onVerticalDragMove?.(
          dragSide.current,
          deltaFromStart,
          currentPosition.y,
        );
      }

      lastTouchPosition.current = currentPosition;
    },
    [onVerticalDragStart, onVerticalDragMove, screenWidth],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        shouldIgnoreTouch.current = false;
        return;
      }

      const touchEndTime = Date.now();
      const touchEndPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };

      const touchDuration = touchEndTime - touchStartTime.current;
      const deltaX = touchEndPosition.x - touchStartPosition.current.x;
      const deltaY = touchEndPosition.y - touchStartPosition.current.y;
      const _absX = Math.abs(deltaX);
      const _absY = Math.abs(deltaY);
      const totalDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // End vertical drag if we were dragging
      if (
        isDragging.current &&
        dragSide.current &&
        gestureType.current === "vertical"
      ) {
        onVerticalDragEnd?.(dragSide.current);
        isDragging.current = false;
        dragSide.current = null;
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Check if gesture is too long for discrete actions
      if (touchDuration > maxDuration) {
        hasMovedEnough.current = false;
        gestureType.current = "none";
        return;
      }

      // Check if it's a tap (short duration and small movement)
      if (
        !hasMovedEnough.current &&
        touchDuration < 300 &&
        totalDistance < 10
      ) {
        const currentTime = Date.now();
        const tapX = touchEndPosition.x;
        const tapY = touchEndPosition.y;

        // Check for double tap
        const timeSinceLastTap = currentTime - lastTapTime.current;
        const distanceFromLastTap = Math.sqrt(
          (tapX - lastTapPosition.current.x) ** 2 +
            (tapY - lastTapPosition.current.y) ** 2,
        );

        if (
          timeSinceLastTap <= doubleTapTimeWindow &&
          distanceFromLastTap < 50
        ) {
          // It's a double tap
          const isLeftSide = tapX < screenWidth / 2;
          if (isLeftSide) {
            onDoubleTapLeft?.();
          } else {
            onDoubleTapRight?.();
          }
          // Reset last tap to prevent triple tap
          lastTapTime.current = 0;
          lastTapPosition.current = { x: 0, y: 0 };
        } else {
          // It's a single tap - execute immediately
          onTap?.();
          lastTapTime.current = currentTime;
          lastTapPosition.current = { x: tapX, y: tapY };
        }
      }

      hasMovedEnough.current = false;
      gestureType.current = "none";
    },
    [
      maxDuration,
      minDistance,
      onDoubleTapLeft,
      onDoubleTapRight,
      onVerticalDragEnd,
      onTap,
      doubleTapTimeWindow,
      screenWidth,
    ],
  );

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};
