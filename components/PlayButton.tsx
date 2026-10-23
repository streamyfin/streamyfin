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
  PlayServicesState,
  useCastDevice,
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
import { RECEIVER_LOAD_TIMEOUT_MS } from "@/constants/Cast";
import { useHaptic } from "@/hooks/useHaptic";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { isExternalPlayerSupported, useSettings } from "@/utils/atoms/settings";
import {
  castToJellyfinReceiver,
  currentReceiverName,
  receiverNameFor,
} from "@/utils/cast/jellyfinReceiver";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { formatDuration, runtimeTicksToMinutes } from "@/utils/time";
import { Button } from "./Button";
import { Text } from "./common/Text";
import type { SelectedOptions } from "./ItemContent";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  colors?: ThemeColors;
}

/** A row of the sheet that asks where the item plays. */
type PlayerChoice = "cast" | "device" | "otherApp" | "chooseApp" | "cancel";

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
  colors,
  disabled,
}: Props) => {
  const isOffline = useOfflineMode();
  const { showActionSheetWithOptions } = useActionSheet();
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const { t } = useTranslation();
  const { showModal, hideModal } = useGlobalModal();

  const [globalColorAtom] = useAtom(itemThemeColorAtom);
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Use colors prop if provided, otherwise fallback to global atom
  const effectiveColors = colors || globalColorAtom;

  const startWidth = useSharedValue(0);
  const targetWidth = useSharedValue(0);
  const endColor = useSharedValue(effectiveColors);
  const startColor = useSharedValue(effectiveColors);
  const widthProgress = useSharedValue(0);
  const colorChangeProgress = useSharedValue(0);
  const { settings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const playMedia = usePlayMedia();
  const { enabled: inSyncPlayGroup } = useSyncPlay();

  /** Asks where to play when there is a choice (a cast device, or `askPlayer`). */
  const choosePlayerAndPlay = useCallback(
    async (playRequest: PlayRequest, askPlayer: boolean) => {
      if (!item) return;

      // A downloaded file plays from this device, so only a stream is cast.
      const canCast = !!client && !playRequest.offline;
      if (!canCast && !askPlayer) {
        await playMedia(playRequest, { item });
        return;
      }

      // Unless asked, the cast sheet stays as it was: "Device" plays where the
      // setting says. Asked, it lists the other players and "Device" means
      // Streamyfin.
      const choices: PlayerChoice[] = [
        ...(canCast ? (["cast"] as const) : []),
        "device",
        ...(askPlayer ? (["otherApp", "chooseApp"] as const) : []),
        "cancel",
      ];
      const labels: Record<PlayerChoice, string> = {
        cast: "Chromecast",
        device: "Device",
        otherApp: t("player.play_in_other_app"),
        chooseApp: t("player.choose_app"),
        cancel: "Cancel",
      };
      showActionSheetWithOptions(
        {
          options: choices.map((choice) => labels[choice]),
          cancelButtonIndex: choices.length - 1,
        },
        async (selectedIndex: number | undefined) => {
          if (!api) return;
          const currentTitle = mediaStatus?.mediaInfo?.metadata?.title;
          const isOpeningCurrentlyPlayingMedia =
            currentTitle && currentTitle === item?.Name;

          switch (
            selectedIndex === undefined ? undefined : choices[selectedIndex]
          ) {
            case "cast":
              await CastContext.getPlayServicesState().then(async (state) => {
                if (state && state !== PlayServicesState.SUCCESS) {
                  CastContext.showPlayServicesErrorDialog(state);
                } else {
                  // Validate required parameters before casting
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

                  // The official Jellyfin receiver negotiates playback on its
                  // own: it is handed the item plus the chosen streams and runs
                  // PlaybackInfo itself, which is what opens a real Jellyfin
                  // session and makes the cast visible in the dashboard. No
                  // stream URL, device profile or sidecar subtitle track is
                  // built here any more -- the receiver handles all of it.
                  if (!client) return;
                  try {
                    const outcome = await castToJellyfinReceiver(
                      client,
                      {
                        api,
                        userId: user.Id,
                        receiverName:
                          (await currentReceiverName()) ??
                          receiverNameFor(castDevice),
                        maxBitrate: selectedOptions.bitrate?.value,
                      },
                      {
                        items: [item],
                        startPositionTicks:
                          playRequest.playbackPositionTicks ?? 0,
                        mediaSourceId:
                          selectedOptions.mediaSource?.Id ?? undefined,
                        audioStreamIndex: selectedOptions.audioIndex,
                        subtitleStreamIndex: selectedOptions.subtitleIndex,
                      },
                      RECEIVER_LOAD_TIMEOUT_MS,
                    );

                    const notStarted = castNotStartedMessage(t, outcome);
                    if (notStarted) {
                      writeErrorLog("Chromecast did not start", outcome);
                      Alert.alert(t("player.client_error"), notStarted);
                    } else if (
                      outcome.status === "loaded" &&
                      // state is already set when reopening current media, so skip it here.
                      !isOpeningCurrentlyPlayingMedia
                    ) {
                      CastContext.showExpandedControls();
                    }
                  } catch (e) {
                    logAndCaptureError("Chromecast playback failed", e);
                    Alert.alert(
                      t("player.client_error"),
                      t("player.chromecast_playback_failed"),
                    );
                  }
                }
              });
              break;
            case "device":
              await playMedia(playRequest, {
                item,
                externalPlayer: askPlayer ? false : undefined,
              });
              break;
            case "otherApp":
              await playMedia(playRequest, { item, externalPlayer: true });
              break;
            case "chooseApp":
              await playMedia(playRequest, {
                item,
                externalPlayer: true,
                chooseApp: true,
              });
              break;
          }
        },
      );
    },
    [
      item,
      client,
      castDevice,
      api,
      user,
      showActionSheetWithOptions,
      mediaStatus,
      selectedOptions,
      playMedia,
      t,
    ],
  );

  const handleNormalPlayFlow = useCallback(
    async (positionTicks: number, askPlayer: boolean) => {
      if (!item) return;

      await choosePlayerAndPlay(
        {
          itemId: item.Id!,
          audioIndex: selectedOptions.audioIndex,
          subtitleIndex: selectedOptions.subtitleIndex,
          mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
          bitrateValue: selectedOptions.bitrate?.value,
          offline: isOffline,
          playbackPositionTicks: positionTicks,
        },
        askPlayer,
      );
    },
    [item, selectedOptions, isOffline, choosePlayerAndPlay],
  );

  const startPlayback = useCallback(
    async (positionTicks: number, askPlayer: boolean) => {
      if (!item) return;

      // Check if item is downloaded
      const downloadedItem = item.Id
        ? getDownloadedItemById(item.Id)
        : undefined;

      // If already in offline mode, play downloaded file directly
      if (isOffline && downloadedItem) {
        await choosePlayerAndPlay(
          {
            itemId: item.Id!,
            offline: true,
            playbackPositionTicks: positionTicks,
          },
          askPlayer,
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
                      void choosePlayerAndPlay(
                        {
                          itemId: item.Id!,
                          offline: true,
                          playbackPositionTicks: positionTicks,
                        },
                        askPlayer,
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
                      handleNormalPlayFlow(positionTicks, askPlayer);
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
                  void choosePlayerAndPlay(
                    {
                      itemId: item.Id!,
                      offline: true,
                      playbackPositionTicks: positionTicks,
                    },
                    askPlayer,
                  );
                },
                isPreferred: true,
              },
              {
                text: t("player.downloaded_file_no"),
                onPress: () => {
                  handleNormalPlayFlow(positionTicks, askPlayer);
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
      handleNormalPlayFlow(positionTicks, askPlayer);
    },
    [
      item,
      isOffline,
      handleNormalPlayFlow,
      choosePlayerAndPlay,
      t,
      showModal,
      hideModal,
    ],
  );

  const onPress = useCallback(
    (askPlayer: boolean) => {
      if (!item) return;

      lightHapticFeedback();

      // Same prompt the TV item page shows: an in-progress item asks whether
      // to resume or restart instead of silently resuming. Users can turn the
      // prompt off in settings, in which case playback resumes right away.
      const progressTicks = item.UserData?.PlaybackPositionTicks ?? 0;
      if (progressTicks > 0 && !settings.showResumeDialog) {
        void startPlayback(progressTicks, askPlayer);
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
              onPress: () => void startPlayback(0, askPlayer),
            },
            {
              text: t("item_card.continue_from", {
                time: formatDuration(progressTicks),
              }),
              onPress: () => void startPlayback(progressTicks, askPlayer),
              isPreferred: true,
            },
          ],
        );
        return;
      }

      void startPlayback(0, askPlayer);
    },
    [item, lightHapticFeedback, startPlayback, t, settings.showResumeDialog],
  );

  // "ask" asks on every tap. "askOnLongPress" and "external" ask on a long
  // press, for "external" the way back to Streamyfin and the chooser. Left
  // unset otherwise, so a long press plays as a tap.
  const externalPlayerMode = isExternalPlayerSupported
    ? settings.externalPlayerMode
    : "off";
  const askPlayerOnTap = externalPlayerMode === "ask";
  const askPlayerOnLongPress =
    externalPlayerMode === "askOnLongPress" ||
    externalPlayerMode === "external";

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
      disabled={!item || !!disabled}
      accessibilityLabel={t("accessibility.play_button")}
      accessibilityHint={t("accessibility.play_hint")}
      onPress={() => onPress(askPlayerOnTap)}
      onLongPress={askPlayerOnLongPress ? () => onPress(true) : undefined}
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
          {/* In a group this button plays for everyone in it. Downloads
              stay solo, so they keep the plain button. */}
          {inSyncPlayGroup && !isOffline && (
            <Animated.Text
              testID='play-button-syncplay'
              style={animatedTextStyle}
            >
              <Ionicons name='people' size={22} />
            </Animated.Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
