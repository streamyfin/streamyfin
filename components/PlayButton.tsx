import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { chromecast } from "@/utils/profiles/chromecast";
import { chromecasth265 } from "@/utils/profiles/chromecasth265";
import { runtimeTicksToMinutes } from "@/utils/time";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useRouter } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable } from "react-native";
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
import type { Button } from "./Button";
import type { SelectedOptions } from "./ItemContent";

interface Props extends React.ComponentProps<typeof Button> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  randomEpisode?: boolean;
  icon?: string;
}

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
  randomEpisode = false,
  icon,
  ...props
}: Props) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const client = useRemoteMediaClient();
  const mediaStatus = useMediaStatus();
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
  const [settings, updateSettings] = useSettings();
  const lightHapticFeedback = useHaptic("light");

  const goToPlayer = useCallback(
    (q: string) => {
      if (settings.maxAutoPlayEpisodeCount.value !== -1) {
        updateSettings({ autoPlayEpisodeCount: 0 });
      }
      router.push(`/player/direct-player?${q}`);
    },
    [router],
  );

  const onPress = useCallback(async () => {
    if (!item) return;

    lightHapticFeedback();
    let queryParams: URLSearchParams;

    // Helper function to handle playback
    const handlePlayback = (queryString: string) => {
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

                  // Get a new URL with the Chromecast device profile
                  try {
                    const data = await getStreamUrl({
                      api,
                      item,
                      deviceProfile: enableH265 ? chromecasth265 : chromecast,
                      startTimeTicks: item?.UserData?.PlaybackPositionTicks!,
                      userId: user?.Id,
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
    };

    if (randomEpisode) {
      if (item.Type !== "Episode") return;

      const seasonId = item.SeasonId;
      const seriesId = item.SeriesId;
      if (!seasonId || !seriesId || !api || !user?.Id) {
        console.error("Missing required IDs", { seasonId, seriesId });
        return;
      }

      try {
        const response = await api.axiosInstance.get(
          `${api.basePath}/Shows/${seriesId}/Episodes`,
          {
            params: {
              userId: user.Id,
              seasonId,
              Fields: "Overview,MediaSources,MediaSourceCount",
            },
            headers: {
              Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
            },
          },
        );

        const episodes = response.data.Items as BaseItemDto[];
        if (!episodes || episodes.length === 0) {
          return;
        }

        const randomIndex = Math.floor(Math.random() * episodes.length);
        const randomItem = episodes[randomIndex];

        if (!randomItem?.Id) {
          return;
        }

        let episodeInfo = randomItem.Name || "Unknown Episode";
        if (randomItem.IndexNumber) {
          episodeInfo = `S${randomItem.ParentIndexNumber || 1}:E${randomItem.IndexNumber} - ${
            randomItem.Name || "Unknown"
          }`;
        }

        Alert.alert(
          t("player.random_episode"),
          episodeInfo,
          [
            {
              text: t("player.play"),
              onPress: () => {
                // console.log("Playing random episode with ID:", randomItem.Id);

                if (!randomItem.MediaSources) {
                  if (api && user?.Id) {
                    getUserItemData({
                      api,
                      userId: user.Id,
                      itemId: randomItem.Id || "",
                    })
                      .then((updatedItem: BaseItemDto | null) => {
                        if (!updatedItem) {
                          Alert.alert(
                            t("player.client_error"),
                            t("player.failed_to_get_media_info"),
                          );
                          return;
                        }

                        queryParams = new URLSearchParams();
                        queryParams.set("itemId", updatedItem.Id || "");
                        queryParams.set(
                          "audioIndex",
                          selectedOptions.audioIndex?.toString() ?? "",
                        );
                        queryParams.set(
                          "subtitleIndex",
                          selectedOptions.subtitleIndex?.toString() ?? "",
                        );
                        queryParams.set(
                          "mediaSourceId",
                          updatedItem.MediaSources?.[0]?.Id ?? "",
                        );
                        queryParams.set(
                          "bitrateValue",
                          selectedOptions.bitrate?.value?.toString() ?? "",
                        );

                        const queryString = queryParams.toString();
                        goToPlayer(queryString);
                      })
                      .catch((err: Error) => {
                        // console.error("Failed to get updated item data:", err);
                        Alert.alert(
                          t("player.client_error"),
                          t("player.failed_to_get_stream_url"),
                        );
                      });
                    return;
                  }
                }

                queryParams = new URLSearchParams();
                queryParams.set("itemId", randomItem.Id || "");
                queryParams.set(
                  "audioIndex",
                  selectedOptions.audioIndex?.toString() ?? "",
                );
                queryParams.set(
                  "subtitleIndex",
                  selectedOptions.subtitleIndex?.toString() ?? "",
                );
                queryParams.set(
                  "mediaSourceId",
                  randomItem.MediaSources?.[0]?.Id ?? "",
                );
                queryParams.set(
                  "bitrateValue",
                  selectedOptions.bitrate?.value?.toString() ?? "",
                );

                const queryString = queryParams.toString();
                goToPlayer(queryString);
              },
              style: "default",
            },
            {
              text: t("player.cancel"),
              style: "cancel",
            },
          ],
          { cancelable: true },
        );

        return;
      } catch (error) {
        // console.error("Error selecting random episode:", error);
        Alert.alert(
          t("player.client_error"),
          t("player.failed_to_get_episodes"),
        );
        return;
      }
    } else {
      if (!item.MediaSources || item.MediaSources.length === 0) {
        if (api && user?.Id && item.Id) {
          getUserItemData({
            api,
            userId: user.Id,
            itemId: item.Id,
          })
            .then((updatedItem: BaseItemDto | null) => {
              if (!updatedItem) {
                Alert.alert(
                  t("player.client_error"),
                  t("player.failed_to_get_media_info"),
                );
                return;
              }

              queryParams = new URLSearchParams();
              queryParams.set("itemId", updatedItem.Id || "");
              queryParams.set(
                "audioIndex",
                selectedOptions.audioIndex?.toString() ?? "",
              );
              queryParams.set(
                "subtitleIndex",
                selectedOptions.subtitleIndex?.toString() ?? "",
              );
              queryParams.set(
                "mediaSourceId",
                updatedItem.MediaSources?.[0]?.Id ?? "",
              );
              queryParams.set(
                "bitrateValue",
                selectedOptions.bitrate?.value?.toString() ?? "",
              );

              handlePlayback(queryParams.toString());
            })
            .catch((err: Error) => {
              Alert.alert(
                t("player.client_error"),
                t("player.failed_to_get_stream_url"),
              );
            });
          return;
        }
      }

      queryParams = new URLSearchParams();
      queryParams.set("itemId", item.Id || "");
      queryParams.set(
        "audioIndex",
        selectedOptions.audioIndex?.toString() ?? "",
      );
      queryParams.set(
        "subtitleIndex",
        selectedOptions.subtitleIndex?.toString() ?? "",
      );
      queryParams.set("mediaSourceId", selectedOptions.mediaSource?.Id ?? "");
      queryParams.set(
        "bitrateValue",
        selectedOptions.bitrate?.value?.toString() ?? "",
      );

      const queryString = queryParams.toString();
      handlePlayback(queryString);
    }
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
    randomEpisode,
    lightHapticFeedback,
    goToPlayer,
    t,
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
    () => colorAtom,
    (newColor) => {
      endColor.value = newColor;
      colorChangeProgress.value = 0;
      colorChangeProgress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.bezier(0.9, 0, 0.31, 0.99),
      });
    },
    [colorAtom],
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
    width: `${interpolate(widthProgress.value, [0, 1], [startWidth.value, targetWidth.value])}%`,
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

  return (
    <TouchableOpacity
      disabled={!item}
      accessibilityLabel='Play button'
      accessibilityHint='Tap to play the media'
      onPress={onPress}
      className={"relative"}
      {...props}
    >
      <View className='absolute w-full h-full top-0 left-0 rounded-xl z-10 overflow-hidden'>
        {!randomEpisode && (
          <Animated.View
            style={[
              animatedPrimaryStyle,
              animatedWidthStyle,
              {
                height: "100%",
              },
            ]}
          />
        )}
      </View>

      <Animated.View
        style={[animatedAverageStyle, { opacity: 0.5 }]}
        className='absolute w-full h-full top-0 left-0 rounded-xl'
      />
      <View
        style={{
          borderWidth: 1,
          borderColor: colorAtom.primary,
          borderStyle: "solid",
        }}
        className='flex flex-row items-center justify-center bg-transparent rounded-xl z-20 h-12 w-full '
      >
        <View className='flex flex-row items-center space-x-2'>
          {!randomEpisode ? (
            <>
              <Animated.Text
                style={[animatedTextStyle, { fontWeight: "bold" }]}
              >
                {runtimeTicksToMinutes(item?.RunTimeTicks)}
              </Animated.Text>
              <Animated.Text style={animatedTextStyle}>
                <Ionicons name='play-circle' size={24} />
              </Animated.Text>
            </>
          ) : (
            <Animated.Text
              style={[animatedTextStyle, { fontWeight: "bold", fontSize: 20 }]}
            >
              {icon || "🎲"}
            </Animated.Text>
          )}
          {client && !randomEpisode && (
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
