import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface Props {
  color?: string;
  barWidth?: number;
  barCount?: number;
  height?: number;
  gap?: number;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 1;
const DURATIONS = [800, 650, 750];
const DELAYS = [0, 200, 100];

const Bar: React.FC<{
  color: string;
  barWidth: number;
  height: number;
  duration: number;
  delay: number;
}> = ({ color, barWidth, height, duration, delay }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleY: interpolate(progress.value, [0, 1], [MIN_SCALE, MAX_SCALE]),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          width: barWidth,
          height,
          backgroundColor: color,
          borderRadius: 1,
        },
        animatedStyle,
      ]}
    />
  );
};

export const AnimatedEqualizer: React.FC<Props> = ({
  color = "#9334E9",
  barWidth = 3,
  barCount = 3,
  height = 12,
  gap = 2,
}) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        height,
        gap,
        marginRight: 6,
      }}
    >
      {Array.from({ length: barCount }).map((_, index) => (
        <Bar
          key={index}
          color={color}
          barWidth={barWidth}
          height={height}
          duration={DURATIONS[index % DURATIONS.length]}
          delay={DELAYS[index % DELAYS.length]}
        />
      ))}
    </View>
  );
};
