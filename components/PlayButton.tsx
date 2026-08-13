import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import CastContext, {
  CastButton,
  MediaHlsSegmentFormat,
  MediaHlsVideoSegmentFormat,
  MediaStreamType,
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
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import { getParentBackdropImageUrl } from "@/utils/jellyfin/image/getParentBackdropImageUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { formatDuration, runtimeTicksToMinutes } from "@/utils/time";
import { chromecast } from "../utils/profiles/chromecast";
import { chromecasth265 } from "../utils/profiles/chromecasth265";
import { Button } from "./Button";
import { Text } from "./common/Text";
import type { SelectedOptions } from "./ItemContent";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  colors?: ThemeColors;
}

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
  colors,
}: Props) => {
  const isOffline = useOfflineMode();
  const { showActionSheetWithOptions } = useActionSheet();
  const client = useRemoteMediaClient();
  const mediaStatus = useMediaStatus();
  const { t } = useTranslation();
  const { showModal, hideModal } = useGlobalModal();

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
  const { settings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const playMedia = usePlayMedia();

  const handleNormalPlayFlow = useCallback(
    async (positionTicks: number) => {
      if (!item) return;

      const playRequest: PlayRequest = {
        itemId: item.Id!,
        audioIndex: selectedOptions.audioIndex,
        subtitleIndex: selectedOptions.subtitleIndex,
        mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
        bitrateValue: selectedOptions.bitrate?.value,
        offline: isOffline,
        playbackPositionTicks: positionTicks,
      };

      if (!client) {
        await playMedia(playRequest, { item });
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
                      startTimeTicks: positionTicks,
                      userId: user.Id,
                      audioStreamIndex: selectedOptions.audioIndex,
                      maxStreamingBitrate: selectedOptions.bitrate?.value,
                      mediaSourceId: selectedOptions.mediaSource?.Id,
                      subtitleStreamIndex: selectedOptions.subtitleIndex,
                    });

                    if (!data?.url) {
                      console.warn("No URL returned from getStreamUrl", data);
                      Alert.alert(
                        t("player.client_error"),
                        t("player.could_not_create_stream_for_chromecast"),
                      );
                      return;
                    }

                    // Calculate start time in seconds from playback position
                    const startTimeSeconds = positionTicks / 10000000;

                    // Calculate stream duration in seconds from runtime
                    const streamDurationSeconds = item.RunTimeTicks
                      ? item.RunTimeTicks / 10000000
                      : undefined;

                    // HLS transcodes must be declared as HLS, otherwise the
                    // receiver tries to parse the m3u8 playlist as an MP4 file
                    // and the cast session dies immediately.
                    const isHls = data.url.includes(".m3u8");
                    // Jellyfin puts the HLS segment container in the URL; the
                    // receiver needs the matching hint (HEVC only works in fMP4).
                    const isFmp4 = data.url.includes("SegmentContainer=mp4");

                    client
                      .loadMedia({
                        mediaInfo: {
                          contentId: item.Id,
                          contentUrl: data?.url,
                          contentType: isHls
                            ? "application/x-mpegURL"
                            : "video/mp4",
                          ...(isHls && {
                            hlsSegmentFormat: isFmp4
                              ? MediaHlsSegmentFormat.FMP4
                              : MediaHlsSegmentFormat.TS,
                            hlsVideoSegmentFormat: isFmp4
                              ? MediaHlsVideoSegmentFormat.FMP4
                              : MediaHlsVideoSegmentFormat.MPEG2_TS,
                          }),
                          streamType: MediaStreamType.BUFFERED,
                          streamDuration: streamDurationSeconds,
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
                        startTime: startTimeSeconds,
                      })
                      .then(() => {
                        // state is already set when reopening current media, so skip it here.
                        if (isOpeningCurrentlyPlayingMedia) {
                          return;
                        }
                        CastContext.showExpandedControls();
                      })
                      .catch((e) => {
                        console.error("Chromecast loadMedia failed:", e);
                      });
                  } catch (e) {
                    console.log(e);
                  }
                }
              });
              break;
            case 1:
              await playMedia(playRequest, { item });
              break;
            case cancelButtonIndex:
              break;
          }
        },
      );
    },
    [
      item,
      client,
      settings,
      api,
      user,
      router,
      showActionSheetWithOptions,
      mediaStatus,
      selectedOptions,
      playMedia,
      isOffline,
      t,
    ],
  );

  const startPlayback = useCallback(
    async (positionTicks: number) => {
      if (!item) return;

      // Check if item is downloaded
      const downloadedItem = item.Id
        ? getDownloadedItemById(item.Id)
        : undefined;

      // If already in offline mode, play downloaded file directly
      if (isOffline && downloadedItem) {
        await playMedia(
          {
            itemId: item.Id!,
            offline: true,
            playbackPositionTicks: positionTicks,
          },
          { item },
        );
        return;
      }

      // If online but file is downloaded, ask user which version to play
      if (downloadedItem) {
        if (Platform.OS === "android") {
          // Show bottom sheet for Android
          showModal(
            <BottomSheetView>
              <View className='px-4 mt-4 mb-12'>
                <View className='pb-6'>
                  <Text className='text-2xl font-bold mb-2'>
                    {t("player.downloaded_file_title")}
                  </Text>
                  <Text className='opacity-70 text-base'>
                    {t("player.downloaded_file_message")}
                  </Text>
                </View>
                <View className='space-y-3'>
                  <Button
                    onPress={() => {
                      hideModal();
                      void playMedia(
                        {
                          itemId: item.Id!,
                          offline: true,
                          playbackPositionTicks: positionTicks,
                        },
                        { item },
                      );
                    }}
                    color='purple'
                  >
                    {Platform.OS === "android"
                      ? "Play downloaded file"
                      : t("player.downloaded_file_yes")}
                  </Button>
                  <Button
                    onPress={() => {
                      hideModal();
                      handleNormalPlayFlow(positionTicks);
                    }}
                    color='white'
                    variant='border'
                  >
                    {Platform.OS === "android"
                      ? "Stream file"
                      : t("player.downloaded_file_no")}
                  </Button>
                </View>
              </View>
            </BottomSheetView>,
            {
              snapPoints: ["35%"],
              enablePanDownToClose: true,
            },
          );
        } else {
          // Show alert for iOS
          Alert.alert(
            t("player.downloaded_file_title"),
            t("player.downloaded_file_message"),
            [
              {
                text: t("player.downloaded_file_yes"),
                onPress: () => {
                  void playMedia(
                    {
                      itemId: item.Id!,
                      offline: true,
                      playbackPositionTicks: positionTicks,
                    },
                    { item },
                  );
                },
                isPreferred: true,
              },
              {
                text: t("player.downloaded_file_no"),
                onPress: () => {
                  handleNormalPlayFlow(positionTicks);
                },
              },
              {
                text: t("player.downloaded_file_cancel"),
                style: "cancel",
              },
            ],
          );
        }
        return;
      }

      // If not downloaded, proceed with normal flow
      handleNormalPlayFlow(positionTicks);
    },
    [item, isOffline, handleNormalPlayFlow, playMedia, t, showModal, hideModal],
  );

  const onPress = useCallback(() => {
    if (!item) return;

    lightHapticFeedback();

    // Same prompt the TV item page shows: an in-progress item asks whether
    // to resume or restart instead of silently resuming. Users can turn the
    // prompt off in settings, in which case playback resumes right away.
    const progressTicks = item.UserData?.PlaybackPositionTicks ?? 0;
    if (progressTicks > 0 && !settings.showResumeDialog) {
      void startPlayback(progressTicks);
      return;
    }
    if (progressTicks > 0) {
      Alert.alert(
        t("item_card.resume_playback"),
        t("item_card.resume_playback_description"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
          },
          {
            text: t("item_card.play_from_start"),
            onPress: () => void startPlayback(0),
          },
          {
            text: t("item_card.continue_from", {
              time: formatDuration(progressTicks),
            }),
            onPress: () => void startPlayback(progressTicks),
            isPreferred: true,
          },
        ],
      );
      return;
    }

    void startPlayback(0);
  }, [item, lightHapticFeedback, startPlayback, t, settings.showResumeDialog]);

  const derivedTargetWidth = useDerivedValue(() => {
    if (!item?.RunTimeTicks) return 0;
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

  return (
    <TouchableOpacity
      disabled={!item}
      accessibilityLabel={t("accessibility.play_button")}
      accessibilityHint={t("accessibility.play_hint")}
      onPress={onPress}
      className={"relative flex-1"}
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
        </View>
      </View>
    </TouchableOpacity>
  );
};
