import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";

interface NextEpisodeCountDownButtonProps extends TouchableOpacityProps {
  onFinish?: () => void;
  onPress?: () => void;
  show: boolean;
  // When true the button renders statically: no countdown animation and
  // onFinish is never invoked. Used after a manual Skip Credits so the user
  // must tap to advance instead of being auto-skipped to the next episode.
  manual?: boolean;
}

const NextEpisodeCountDownButton: React.FC<NextEpisodeCountDownButtonProps> = ({
  onFinish,
  onPress,
  show,
  manual = false,
  ...props
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    // In manual mode the button never counts down and never auto-advances.
    if (show && !manual) {
      progress.value = 0;
      progress.value = withTiming(
        1,
        {
          duration: 10000, // 10 seconds
          easing: Easing.linear,
        },
        (finished) => {
          if (finished && onFinish) {
            runOnJS(onFinish)();
          }
        },
      );

      // Cancel animation on unmount to prevent onFinish from firing after exit
      return () => {
        cancelAnimation(progress);
      };
    }
  }, [show, onFinish, manual]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: `${progress.value * 100}%`,
      backgroundColor: Colors.primary,
    };
  });

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  const { t } = useTranslation();

  if (!show) {
    return null;
  }

  return (
    <TouchableOpacity
      className='w-32 overflow-hidden rounded-md bg-black/60 border border-neutral-900'
      {...props}
      onPress={handlePress}
    >
      {!manual && <Animated.View style={animatedStyle} />}
      <View className='px-3 py-3'>
        <Text numberOfLines={1} className='text-center font-bold'>
          {t("player.next_episode")}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default NextEpisodeCountDownButton;
