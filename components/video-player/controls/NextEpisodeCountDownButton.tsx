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
  // When false, the button is shown as a plain tap target with no fill
  // animation and never auto-advances — used when the trigger that revealed
  // it (e.g. credits-segment metadata) isn't reliable enough to act on
  // without the user confirming.
  autoAdvance?: boolean;
}

const NextEpisodeCountDownButton: React.FC<NextEpisodeCountDownButtonProps> = ({
  onFinish,
  onPress,
  show,
  autoAdvance = true,
  ...props
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (show && autoAdvance) {
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
    // Not auto-advancing (or not shown): keep the fill empty, no timer.
    cancelAnimation(progress);
    progress.value = 0;
  }, [show, autoAdvance, onFinish]);

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
      <Animated.View style={animatedStyle} />
      <View className='px-3 py-2'>
        <Text numberOfLines={1} className='text-center text-sm font-bold'>
          {t("player.next_episode")}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default NextEpisodeCountDownButton;
