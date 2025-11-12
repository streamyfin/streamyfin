import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, TouchableOpacity, View } from "react-native";
import CastContext, {
  CastButton,
  PlayServicesState,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
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
import { useHaptic } from "@/hooks/useHaptic";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { chromecast } from "@/utils/profiles/chromecast";
import { chromecasth265 } from "@/utils/profiles/chromecasth265";
import { runtimeTicksToMinutes } from "@/utils/time";
import type { SelectedOptions } from "./ItemContent";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  isOffline?: boolean;
  colors?: ThemeColors;
}

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
  isOffline,
  colors,
  ...props
}: Props) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const client = useRemoteMediaClient();
  const mediaStatus = useMediaStatus();
  const { t } = useTranslation();

  const [globalColorAtom] = useAtom(itemThemeColorAtom);
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Use colors prop if provided, otherwise fallback to global atom
  const effectiveColors = colors || globalColorAtom;

  const router = useRouter();

  const startWidth = useSharedValue(0);
  const targetWidth = useSharedValue(0);
  const endColor = useSharedValue(effectiveColors);
  const startColor = useSharedValue(effectiveColors);
  const widthProgress = useSharedValue(0);
  const colorChangeProgress = useSharedValue(0);
  const { settings, updateSettings } = useSettings();
  const lightHapticFeedback = useHaptic("light");

  const goToPlayer = useCallback(
    (q: string) => {
      if (settings.maxAutoPlayEpisodeCount.value !== -1) {
        updateSettings({ autoPlayEpisodeCount: 0 });
      }
      router.push(`/player/direct-player?${q}`);
    },
    [router, isOffline],
  );

  const onPress = useCallback(async () => {
    console.log("onPress");
    if (!item) return;

    lightHapticFeedback();

    const queryParams = new URLSearchParams({
      itemId: item.Id!,
      audioIndex: selectedOptions.audioIndex?.toString() ?? "",
      subtitleIndex: selectedOptions.subtitleIndex?.toString() ?? "",
      mediaSourceId: selectedOptions.mediaSource?.Id ?? "",
      bitrateValue: selectedOptions.bitrate?.value?.toString() ?? "",
      playbackPosition: item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
      offline: isOffline ? "true" : "false",
    });

    const queryString = queryParams.toString();

    if (!client) {
      goToPlayer(queryString);
      return;
    }

    const options = ["Chromecast", "Device", "Cancel"];
    const cancelButtonIndex = 2;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      async (selectedIndex: number | undefined) => {
        if (!api) return;
        const currentTitle = mediaStatus?.mediaInfo?.metadata?.title;
        const isOpeningCurrentlyPlayingMedia =
          currentTitle && currentTitle === item?.Name;

        switch (selectedIndex) {
          case 0:
            await CastContext.getPlayServicesState().then(async (state) => {
              if (state && state !== PlayServicesState.SUCCESS) {
                CastContext.showPlayServicesErrorDialog(state);
              } else {
                // Check if user wants H265 for Chromecast
                const enableH265 = settings.enableH265ForChromecast;

                // Validate required parameters before calling getStreamUrl
                if (!api) {
                  console.warn("API not available for Chromecast streaming");
                  Alert.alert(
                    t("player.client_error"),
                    t("player.missing_parameters"),
                  );
                  return;
                }
                if (!user?.Id) {
                  console.warn(
                    "User not authenticated for Chromecast streaming",
                  );
                  Alert.alert(
                    t("player.client_error"),
                    t("player.missing_parameters"),
                  );
                  return;
                }
                if (!item?.Id) {
                  console.warn("Item not available for Chromecast streaming");
                  Alert.alert(
                    t("player.client_error"),
                    t("player.missing_parameters"),
                  );
                  return;
                }

                // Get a new URL with the Chromecast device profile
                try {
                  const data = await getStreamUrl({
                    api,
                    item,
                    deviceProfile: enableH265 ? chromecasth265 : chromecast,
                    startTimeTicks: item?.UserData?.PlaybackPositionTicks ?? 0,
                    userId: user.Id,
                    audioStreamIndex: selectedOptions.audioIndex,
                    maxStreamingBitrate: selectedOptions.bitrate?.value,
                    mediaSourceId: selectedOptions.mediaSource?.Id,
                    subtitleStreamIndex: selectedOptions.subtitleIndex,
                  });

                  console.log("URL: ", data?.url, enableH265);

                  if (!data?.url) {
                    console.warn("No URL returned from getStreamUrl", data);
                    Alert.alert(
                      t("player.client_error"),
                      t("player.could_not_create_stream_for_chromecast"),
                    );
                    return;
                  }

                  client
                    .loadMedia({
                      mediaInfo: {
                        contentUrl: data?.url,
                        contentType: "video/mp4",
                        metadata:
                          item.Type === "Episode"
                            ? {
                                type: "tvShow",
                                title: item.Name || "",
                                episodeNumber: item.IndexNumber || 0,
                                seasonNumber: item.ParentIndexNumber || 0,
                                seriesTitle: item.SeriesName || "",
                                images: [
                                  {
                                    url: getParentBackdropImageUrl({
                                      api,
                                      item,
                                      quality: 90,
                                      width: 2000,
                                    })!,
                                  },
                                ],
                              }
                            : item.Type === "Movie"
                              ? {
                                  type: "movie",
                                  title: item.Name || "",
                                  subtitle: item.Overview || "",
                                  images: [
                                    {
                                      url: getPrimaryImageUrl({
                                        api,
                                        item,
                                        quality: 90,
                                        width: 2000,
                                      })!,
                                    },
                                  ],
                                }
                              : {
                                  type: "generic",
                                  title: item.Name || "",
                                  subtitle: item.Overview || "",
                                  images: [
                                    {
                                      url: getPrimaryImageUrl({
                                        api,
                                        item,
                                        quality: 90,
                                        width: 2000,
                                      })!,
                                    },
                                  ],
                                },
                      },
                      startTime: 0,
                    })
                    .then(() => {
                      // state is already set when reopening current media, so skip it here.
                      if (isOpeningCurrentlyPlayingMedia) {
                        return;
                      }
                      CastContext.showExpandedControls();
                    });
                } catch (e) {
                  console.log(e);
                }
              }
            });
            break;
          case 1:
            goToPlayer(queryString);
            break;
          case cancelButtonIndex:
            break;
        }
      },
    );
  }, [
    item,
    client,
    settings,
    api,
    user,
    router,
    showActionSheetWithOptions,
    mediaStatus,
    selectedOptions,
  ]);

  const derivedTargetWidth = useDerivedValue(() => {
    if (!item || !item.RunTimeTicks) return 0;
    const userData = item.UserData;
    if (userData?.PlaybackPositionTicks) {
      return userData.PlaybackPositionTicks > 0
        ? Math.max(
            (userData.PlaybackPositionTicks / item.RunTimeTicks) * 100,
            MIN_PLAYBACK_WIDTH,
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
    [item],
  );

  useAnimatedReaction(
    () => effectiveColors,
    (newColor) => {
      endColor.value = newColor;
      colorChangeProgress.value = 0;
      colorChangeProgress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.bezier(0.9, 0, 0.31, 0.99),
      });
    },
    [effectiveColors],
  );

  useEffect(() => {
    const timeout_2 = setTimeout(() => {
      startColor.value = effectiveColors;
      startWidth.value = targetWidth.value;
    }, ANIMATION_DURATION);

    return () => {
      clearTimeout(timeout_2);
    };
  }, [effectiveColors, item]);

  /**
   * ANIMATED STYLES
   */
  const animatedAverageStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.primary, endColor.value.primary],
    ),
  }));

  const animatedPrimaryStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.primary, endColor.value.primary],
    ),
  }));

  const animatedWidthStyle = useAnimatedStyle(() => ({
    width: `${interpolate(
      widthProgress.value,
      [0, 1],
      [startWidth.value, targetWidth.value],
    )}%`,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorChangeProgress.value,
      [0, 1],
      [startColor.value.text, endColor.value.text],
    ),
  }));
  /**
   * *********************
   */

  // if (Platform.OS === "ios")
  //   return (
  //     <Host
  //       style={{
  //         height: 50,
  //         flex: 1,
  //         flexShrink: 0,
  //       }}
  //     >
  //       <Button
  //         variant='glassProminent'
  //         onPress={onPress}
  //         color={effectiveColors.primary}
  //         modifiers={[fixedSize()]}
  //       >
  //         <View className='flex flex-row items-center space-x-2 h-full w-full justify-center -mb-3.5 '>
  //           <Animated.Text style={[animatedTextStyle, { fontWeight: "bold" }]}>
  //             {runtimeTicksToMinutes(
  //               (item?.RunTimeTicks || 0) -
  //                 (item?.UserData?.PlaybackPositionTicks || 0),
  //             )}
  //             {(item?.UserData?.PlaybackPositionTicks || 0) > 0 && " left"}
  //           </Animated.Text>
  //           <Animated.Text style={animatedTextStyle}>
  //             <Ionicons name='play-circle' size={24} />
  //           </Animated.Text>
  //           {client && (
  //             <Animated.Text style={animatedTextStyle}>
  //               <Feather name='cast' size={22} />
  //               <CastButton tintColor='transparent' />
  //             </Animated.Text>
  //           )}
  //           {!client && settings?.openInVLC && (
  //             <Animated.Text style={animatedTextStyle}>
  //               <MaterialCommunityIcons
  //                 name='vlc'
  //                 size={18}
  //                 color={animatedTextStyle.color}
  //               />
  //             </Animated.Text>
  //           )}
  //         </View>
  //       </Button>
  //     </Host>
  //   );

  return (
    <TouchableOpacity
      disabled={!item}
      accessibilityLabel='Play button'
      accessibilityHint='Tap to play the media'
      onPress={onPress}
      className={"relative"}
    >
      <View className='absolute w-full h-full top-0 left-0 rounded-full z-10 overflow-hidden'>
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
        className='absolute w-full h-full top-0 left-0 rounded-full'
      />
      <View
        style={{
          borderWidth: 1,
          borderColor: effectiveColors.primary,
          borderStyle: "solid",
        }}
        className='flex flex-row items-center justify-center bg-transparent rounded-full z-20 h-12 w-full '
      >
        <View className='flex flex-row items-center space-x-2'>
          <Animated.Text style={[animatedTextStyle, { fontWeight: "bold" }]}>
            {runtimeTicksToMinutes(
              (item?.RunTimeTicks || 0) -
                (item?.UserData?.PlaybackPositionTicks || 0),
            )}
            {(item?.UserData?.PlaybackPositionTicks || 0) > 0 && " left"}
          </Animated.Text>
          <Animated.Text style={animatedTextStyle}>
            <Ionicons name='play-circle' size={24} />
          </Animated.Text>
          {client && (
            <Animated.Text style={animatedTextStyle}>
              <Feather name='cast' size={22} />
              <CastButton tintColor='transparent' />
            </Animated.Text>
          )}
          {!client && settings?.openInVLC && (
            <Animated.Text style={animatedTextStyle}>
              <MaterialCommunityIcons
                name='vlc'
                size={18}
                color={animatedTextStyle.color}
              />
            </Animated.Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
