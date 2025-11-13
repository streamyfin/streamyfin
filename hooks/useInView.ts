import { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutRectangle, useWindowDimensions } from "react-native";

interface UseInViewOptions {
  threshold?: number; // Distance in pixels before component is considered "in view"
  enabled?: boolean; // Allow disabling the hook
}

interface UseInViewReturn {
  ref: (node: any) => void;
  isInView: boolean;
  onLayout: () => void;
}

export const useInView = (
  scrollY: number = 0,
  options: UseInViewOptions = {},
): UseInViewReturn => {
  const { threshold = 400, enabled = true } = options;
  const { height: windowHeight } = useWindowDimensions();
  const [layout, setLayout] = useState<LayoutRectangle | null>(null);
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const nodeRef = useRef<any>(null);

  const ref = useCallback((node: any) => {
    nodeRef.current = node;
  }, []);

  const onLayout = useCallback(() => {
    if (!nodeRef.current) return;

    // Use measure to get absolute position
    nodeRef.current.measure(
      (
        _x: number,
        _y: number,
        width: number,
        height: number,
        pageX: number,
        pageY: number,
      ) => {
        setLayout({ x: pageX, y: pageY, width, height });
      },
    );
  }, []);

  useEffect(() => {
    if (!enabled || hasBeenInView || !layout) return;

    // Calculate if the section is in view or about to be
    const sectionTop = layout.y;
    const viewportBottom = scrollY + windowHeight;

    // Check if section is within threshold distance of viewport
    const isNearView = viewportBottom + threshold >= sectionTop;

    if (isNearView) {
      setHasBeenInView(true);
    }
  }, [scrollY, windowHeight, threshold, layout, hasBeenInView, enabled]);

  return {
    ref,
    isInView: hasBeenInView,
    onLayout,
  };
};
