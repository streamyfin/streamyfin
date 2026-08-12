import { useCallback, useEffect, useRef } from "react";
import type { GestureResponderEvent } from "react-native";

export interface SwipeGestureOptions {
  minDistance?: number;
  maxDuration?: number;
  longPressDuration?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onVerticalDragStart?: (side: "left" | "right", initialY: number) => void;
  onVerticalDragMove?: (
    side: "left" | "right",
    deltaY: number,
    currentY: number,
  ) => void;
  onVerticalDragEnd?: (side: "left" | "right") => void;
  onTap?: () => void;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  screenWidth?: number;
  screenHeight?: number;
}

export const useGestureDetection = ({
  minDistance = 50,
  maxDuration = 800,
  longPressDuration = 500,
  onSwipeLeft,
  onSwipeRight,
  onVerticalDragStart,
  onVerticalDragMove,
  onVerticalDragEnd,
  onTap,
  onLongPressStart,
  onLongPressEnd,
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
  const longPressTimeout = useRef<number | null>(null);
  const isLongPressing = useRef(false);

  const cancelLongPressTimer = useCallback(() => {
    if (longPressTimeout.current !== null) {
      clearTimeout(longPressTimeout.current);
      longPressTimeout.current = null;
    }
  }, []);

  // Clear any pending timer on unmount
  useEffect(() => cancelLongPressTimer, [cancelLongPressTimer]);

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      // A held long press owns the gesture, so ignore extra touches
      if (isLongPressing.current) {
        return;
      }

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

      cancelLongPressTimer();
      isLongPressing.current = false;
      if (onLongPressStart) {
        longPressTimeout.current = setTimeout(() => {
          longPressTimeout.current = null;
          isLongPressing.current = true;
          onLongPressStart();
        }, longPressDuration) as unknown as number;
      }
    },
    [screenHeight, cancelLongPressTimer, longPressDuration, onLongPressStart],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        return;
      }

      // Ignore movement while a long press is held
      if (isLongPressing.current) {
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
        // Movement means this is a swipe or drag, not a long press
        cancelLongPressTimer();

        // Determine gesture type based on initial movement direction
        if (absY > absX && absY > 5) {
          // Vertical gesture - start drag immediately
          gestureType.current = "vertical";
          const side =
            touchStartPosition.current.x < screenWidth / 2 ? "left" : "right";
          isDragging.current = true;
          dragSide.current = side;
          onVerticalDragStart?.(side, touchStartPosition.current.y);
        } else if (absX > absY && absX > 10) {
          // Horizontal gesture - mark for discrete swipe
          gestureType.current = "horizontal";
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
    [
      onVerticalDragStart,
      onVerticalDragMove,
      screenWidth,
      cancelLongPressTimer,
    ],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      // Ignore touch if it started in exclusion zone
      if (shouldIgnoreTouch.current) {
        shouldIgnoreTouch.current = false;
        return;
      }

      cancelLongPressTimer();

      // Release the long press without treating it as a tap or swipe
      if (isLongPressing.current) {
        isLongPressing.current = false;
        hasMovedEnough.current = false;
        gestureType.current = "none";
        onLongPressEnd?.();
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
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
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

      // Handle discrete horizontal swipes (for skip) only if it was marked as horizontal
      if (
        gestureType.current === "horizontal" &&
        hasMovedEnough.current &&
        absX > absY &&
        totalDistance > minDistance
      ) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else if (
        !hasMovedEnough.current &&
        touchDuration < 300 &&
        totalDistance < 10
      ) {
        // It's a tap - short duration and small movement
        onTap?.();
      }

      hasMovedEnough.current = false;
      gestureType.current = "none";
    },
    [
      maxDuration,
      minDistance,
      onSwipeLeft,
      onSwipeRight,
      onVerticalDragEnd,
      onTap,
      onLongPressEnd,
      cancelLongPressTimer,
    ],
  );

  // A cancelled touch never delivers touchEnd, so release whatever is
  // engaged without treating it as a tap or swipe
  const handleTouchCancel = useCallback(() => {
    cancelLongPressTimer();
    if (isLongPressing.current) {
      isLongPressing.current = false;
      onLongPressEnd?.();
    }
    if (isDragging.current && dragSide.current) {
      onVerticalDragEnd?.(dragSide.current);
    }
    isDragging.current = false;
    dragSide.current = null;
    hasMovedEnough.current = false;
    gestureType.current = "none";
    shouldIgnoreTouch.current = false;
  }, [cancelLongPressTimer, onLongPressEnd, onVerticalDragEnd]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
};
