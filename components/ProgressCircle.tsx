import React from "react";
import { View, StyleSheet } from "react-native";
import { AnimatedCircularProgress } from "react-native-circular-progress";

type ProgressCircleProps = {
  size: number;
  fill: number; // Progress percentage (0 to 100)
  width: number; // Stroke width of the circle
  tintColor: string; // Color of the progress part
  backgroundColor: string; // Color of the remaining part
};

const ProgressCircle: React.FC<ProgressCircleProps> = ({
  size,
  fill,
  width,
  tintColor,
  backgroundColor,
}) => {
  return (
    <AnimatedCircularProgress
      size={size}
      width={width}
      fill={fill}
      tintColor={tintColor}
      backgroundColor={backgroundColor}
      rotation={0}
    />
  );
};

export default ProgressCircle;
