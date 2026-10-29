import type React from "react";
import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** How long the ring takes to reach a new value. */
const FILL_ANIMATION_MS = 500;

/**
 * The stroke offset that leaves `fill` percent of a ring of this
 * circumference drawn, `fill` clamped to 0..100.
 */
export const ringDashOffset = (circumference: number, fill: number) => {
  "worklet";
  return circumference * (1 - Math.min(100, Math.max(0, fill)) / 100);
};

type ProgressCircleProps = {
  size: number;
  /** Progress in percent, 0 to 100. */
  fill: number;
  /** Stroke width of the ring. */
  width: number;
  /** Colour of the progress part. */
  tintColor: string;
  /** Colour of the remaining part. */
  backgroundColor: string;
};

/** A ring that fills clockwise from the top, easing to each new value. */
const ProgressCircle: React.FC<ProgressCircleProps> = ({
  size,
  fill,
  width,
  tintColor,
  backgroundColor,
}) => {
  const radius = (size - width) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(fill, {
      duration: FILL_ANIMATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [fill, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: ringDashOffset(circumference, progress.value),
  }));

  // A circle's stroke starts at 3 o'clock: turned a quarter back, it starts
  // at the top.
  return (
    <Svg
      width={size}
      height={size}
      style={{ transform: [{ rotate: "-90deg" }] }}
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={backgroundColor}
        strokeWidth={width}
        fill='none'
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={tintColor}
        strokeWidth={width}
        strokeDasharray={circumference}
        animatedProps={animatedProps}
        fill='none'
      />
    </Svg>
  );
};

export default ProgressCircle;
