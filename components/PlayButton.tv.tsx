import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import { runtimeTicksToMinutes } from "@/utils/time";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Button } from "./Button";
import { SelectedOptions } from "./ItemContent";
import { useTranslation } from "react-i18next";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends React.ComponentProps<typeof Button> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
}

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
  ...props
}: Props) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const { t } = useTranslation();

  const [colorAtom] = useAtom(itemThemeColorAtom);
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const router = useRouter();

  const startWidth = useSharedValue(0);
  const targetWidth = useSharedValue(0);
  const endColor = useSharedValue(colorAtom);
  const startColor = useSharedValue(colorAtom);
  const widthProgress = useSharedValue(0);
  const colorChangeProgress = useSharedValue(0);
  const [settings] = useSettings();
  const lightHapticFeedback = useHaptic("light");

  const goToPlayer = useCallback(
    (q: string, bitrateValue: number | undefined) => {
      if (!bitrateValue) {
        router.push(`/player/direct-player?${q}`);
        return;
      }
      router.push(`/player/transcoding-player?${q}`);
    },
    [router]
  );

  const onPress = useCallback(async () => {
    if (!item) return;

    lightHapticFeedback();

    const queryParams = new URLSearchParams({
      itemId: item.Id!,
      audioIndex: selectedOptions.audioIndex?.toString() ?? "",
      subtitleIndex: selectedOptions.subtitleIndex?.toString() ?? "",
      mediaSourceId: selectedOptions.mediaSource?.Id ?? "",
      bitrateValue: selectedOptions.bitrate?.value?.toString() ?? "",
    });

    const queryString = queryParams.toString();
    goToPlayer(queryString, selectedOptions.bitrate?.value);
    return;
  }, [
    item,
    settings,
    api,
    user,
    router,
    showActionSheetWithOptions,
    selectedOptions,
  ]);

  const derivedTargetWidth = useDerivedValue(() => {
    if (!item || !item.RunTimeTicks) return 0;
    const userData = item.UserData;
    if (userData && userData.PlaybackPositionTicks) {
      return userData.PlaybackPositionTicks > 0
        ? Math.max(
            (userData.PlaybackPositionTicks / item.RunTimeTicks) * 100,
            MIN_PLAYBACK_WIDTH
          )
        : 0;
    }
    return 0;
  }, [item]);

  useAnimatedReaction(
    () => derivedTargetWidth.value,
    (newWidth) => {
      targetWidth.value = newWidth;
      widthProgress.value = 0;
      widthProgress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.bezier(0.7, 0, 0.3, 1.0),
      });
    },
    [item]
  );

  useAnimatedReaction(
    () => colorAtom,
    (newColor) => {
      endColor.value = newColor;
      colorChangeProgress.value = 0;
      colorChangeProgress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.bezier(0.9, 0, 0.31, 0.99),
      });
    },
    [colorAtom]
  );

  useEffect(() => {
    const timeout_2 = setTimeout(() => {
      startColor.value = colorAtom;
      startWidth.value = targetWidth.value;
    }, ANIMATION_DURATION);

    return () => {
      clearTimeout(timeout_2);
    };
  }, [colorAtom, item]);

  /**
   * ANIMATED STYLES
   */
  const animatedAverageStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.primary, endColor.value.primary]
    ),
  }));

  const animatedPrimaryStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.primary, endColor.value.primary]
    ),
  }));

  const animatedWidthStyle = useAnimatedStyle(() => ({
    width: `${interpolate(
      widthProgress.value,
      [0, 1],
      [startWidth.value, targetWidth.value]
    )}%`,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.text, endColor.value.text]
    ),
  }));
  /**
   * *********************
   */

  return (
    <View>
      <TouchableOpacity
        disabled={!item}
        accessibilityLabel="Play button"
        accessibilityHint="Tap to play the media"
        onPress={onPress}
        className={`relative`}
        {...props}
      >
        <View className="absolute w-full h-full top-0 left-0 rounded-xl z-10 overflow-hidden">
          <Animated.View
            style={[
              animatedPrimaryStyle,
              animatedWidthStyle,
              {
                height: "100%",
              },
            ]}
          />
        </View>

        <Animated.View
          style={[animatedAverageStyle, { opacity: 0.5 }]}
          className="absolute w-full h-full top-0 left-0 rounded-xl"
        />
        <View
          style={{
            borderWidth: 1,
            borderColor: colorAtom.primary,
            borderStyle: "solid",
          }}
          className="flex flex-row items-center justify-center bg-transparent rounded-xl z-20 h-12 w-full "
        >
          <View className="flex flex-row items-center space-x-2">
            <Animated.Text style={[animatedTextStyle, { fontWeight: "bold" }]}>
              {runtimeTicksToMinutes(item?.RunTimeTicks)}
            </Animated.Text>
            <Animated.Text style={animatedTextStyle}>
              <Ionicons name="play-circle" size={24} />
            </Animated.Text>
            {settings?.openInVLC && (
              <Animated.Text style={animatedTextStyle}>
                <MaterialCommunityIcons
                  name="vlc"
                  size={18}
                  color={animatedTextStyle.color}
                />
              </Animated.Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
      {/* <View className="mt-2 flex flex-row items-center">
        <Ionicons
          name="information-circle"
          size={12}
          className=""
          color={"#9BA1A6"}
        />
        <Text className="text-neutral-500 ml-1">
          {directStream ? "Direct stream" : "Transcoded stream"}
        </Text>
      </View> */}
    </View>
  );
};
