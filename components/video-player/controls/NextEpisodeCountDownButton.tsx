import React, { useEffect } from "react";
import { TouchableOpacity, TouchableOpacityProps, View } from "react-native";
import { Text } from "@/components/common/Text";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Colors } from "@/constants/Colors";
import { useTranslation } from "react-i18next";

interface NextEpisodeCountDownButtonProps extends TouchableOpacityProps {
  onFinish?: () => void;
  onPress?: () => void;
  show: boolean;
}

const NextEpisodeCountDownButton: React.FC<NextEpisodeCountDownButtonProps> = ({
  onFinish,
  onPress,
  show,
  ...props
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (show) {
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
    }
  }, [show, onFinish]);

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
      className="w-32 overflow-hidden rounded-md bg-black/60 border border-neutral-900"
      {...props}
      onPress={handlePress}
    >
      <Animated.View style={animatedStyle} />
      <View className="px-3 py-3">
        <Text className="text-center font-bold">
          {t("player.next_episode")}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default NextEpisodeCountDownButton;
