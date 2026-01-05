import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";

interface Props {
  color?: string;
  barWidth?: number;
  barCount?: number;
  height?: number;
  gap?: number;
}

export const AnimatedEqualizer: React.FC<Props> = ({
  color = "#9334E9",
  barWidth = 3,
  barCount = 3,
  height = 12,
  gap = 2,
}) => {
  const animations = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const durations = [600, 700, 550];
    const minScale = [0.2, 0.3, 0.25];
    const maxScale = [1, 0.85, 0.95];

    // Set initial staggered values
    animations.forEach((anim, index) => {
      anim.setValue(index === 1 ? 0.8 : index === 2 ? 0.4 : 0.2);
    });

    const barAnimations = animations.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: maxScale[index % maxScale.length],
            duration: durations[index % durations.length],
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: minScale[index % minScale.length],
            duration: durations[index % durations.length],
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
    });

    Animated.parallel(barAnimations).start();

    return () => {
      animations.forEach((anim) => {
        anim.stopAnimation();
      });
    };
  }, [animations]);

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
      {animations.map((anim, index) => (
        <Animated.View
          key={index}
          style={{
            width: barWidth,
            height,
            backgroundColor: color,
            borderRadius: 1,
            transform: [{ scaleY: anim }],
          }}
        />
      ))}
    </View>
  );
};
