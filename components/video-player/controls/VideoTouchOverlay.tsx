import { Pressable } from "react-native";
import Animated, { type AnimatedStyle } from "react-native-reanimated";
import { useTapDetection } from "./useTapDetection";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  screenWidth: number;
  screenHeight: number;
  onToggleControls: () => void;
  animatedStyle: AnimatedStyle;
}

export const VideoTouchOverlay = ({
  screenWidth,
  screenHeight,
  onToggleControls,
  animatedStyle,
}: Props) => {
  const { handleTouchStart, handleTouchEnd } = useTapDetection({
    onValidTap: onToggleControls,
  });

  return (
    <AnimatedPressable
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={[
        {
          position: "absolute",
          width: screenWidth,
          height: screenHeight,
          backgroundColor: "black",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
        animatedStyle,
      ]}
    />
  );
};
