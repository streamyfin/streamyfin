import { useActionSheet } from "@expo/react-native-action-sheet";
import { Feather, Ionicons } from "@expo/vector-icons";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtom, useAtomValue, useStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
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
import {
  castClientFor,
  currentCastSession,
  type RemoteTarget,
  showExpandedControls,
  useCastMediaStatus,
  useRemoteTarget,
} from "@/modules/mpv-player/src/cast";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import {
  castToJellyfinReceiver,
  currentReceiverName,
} from "@/utils/cast/jellyfinReceiver";
import { resolvePlay, waitForTarget } from "@/utils/cast/playTarget";
import { castNotStartedMessage } from "@/utils/cast/receiverLoadErrorMessage";
import { maxBitrateFor } from "@/utils/cast/remoteQuality";
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
  const target = useRemoteTarget();
  const mediaStatus = useCastMediaStatus();
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
  const store = useStore();
  // The press waiting for a connection: one at a time, dropped with the button.
  const pendingWait = useRef<AbortController | null>(null);
  useEffect(() => () => pendingWait.current?.abort(), []);

  const playRequestFor = useCallback(
    (positionTicks: number): PlayRequest => ({
      itemId: item.Id!,
      audioIndex: selectedOptions.audioIndex,
      subtitleIndex: selectedOptions.subtitleIndex,
      mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
      bitrateValue: selectedOptions.bitrate?.value,
      offline: isOffline,
      playbackPositionTicks: positionTicks,
    }),
    [item, selectedOptions, isOffline],
  );

  // The official Jellyfin receiver negotiates playback on its own: it is handed
  // the item plus the chosen streams and runs PlaybackInfo itself, which is what
  // opens a real Jellyfin session and makes the cast visible in the dashboard.
  const playOnTarget = useCallback(
    async (positionTicks: number, remote: RemoteTarget) => {
      if (!api || !user?.Id || !item?.Id) {
        Alert.alert(t("player.client_error"), t("player.missing_parameters"));
        return;
      }
      // Read now: a press that waited for the connection holds an older render.
      const session = currentCastSession();
      const client = session ? castClientFor(session) : null;
      if (!client) {
        Alert.alert(t("player.client_error"), t("cast.output.failed"));
        return;
      }
      const currentTitle = mediaStatus?.mediaInfo?.metadata?.title;
      const isOpeningCurrentlyPlayingMedia =
        currentTitle && currentTitle === item.Name;
      try {
        const outcome = await castToJellyfinReceiver(
          client,
          {
            api,
            userId: user.Id,
            receiverName: (await currentReceiverName()) ?? remote.name,
            // The item page's quality is this device's: a receiver plays at the remote one.
            maxBitrate: maxBitrateFor(remote, settings.remotePlaybackQuality),
          },
          {
            items: [item],
            startPositionTicks: positionTicks,
            mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
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
          showExpandedControls();
        }
      } catch (e) {
        logAndCaptureError("Chromecast playback failed", e);
        Alert.alert(
          t("player.client_error"),
          t("player.chromecast_playback_failed"),
        );
      }
    },
    [api, user, item, mediaStatus, selectedOptions, settings, t],
  );

  // One Play action: the target when one is connected, this device otherwise or
  // when asked by a long press. A press while connecting waits for the target.
  const handleNormalPlayFlow = useCallback(
    async (positionTicks: number, longPress = false) => {
      if (!item) return;
      const destination = resolvePlay({
        target,
        offline: isOffline,
        longPress,
      });
      if (destination.where === "target" && target.target) {
        await playOnTarget(positionTicks, target.target);
        return;
      }
      if (destination.where === "waitForTarget") {
        // A second press while one waits adds nothing: the first plays once connected.
        if (pendingWait.current) return;
        const wait = new AbortController();
        pendingWait.current = wait;
        const pressedBy = user?.Id;
        const settled = await waitForTarget(undefined, undefined, {
          signal: wait.signal,
        });
        if (pendingWait.current === wait) pendingWait.current = null;
        // Gone with its button, or another account since the press: the receiver would get its item.
        if (settled === "aborted" || store.get(userAtom)?.Id !== pressedBy) {
          return;
        }
        if (settled !== "timeout" && settled.state === "connected") {
          if (settled.target) await playOnTarget(positionTicks, settled.target);
        } else if (settled === "timeout" || settled.error) {
          // Nothing plays: the connection the press waited for did not come.
          Alert.alert(t("player.client_error"), t("cast.output.failed"));
        }
        // A connection cancelled from the sheet ends without an error: nothing to say.
        return;
      }
      await playMedia(playRequestFor(positionTicks), { item });
    },
    [
      item,
      target,
      isOffline,
      user,
      store,
      playOnTarget,
      playMedia,
      playRequestFor,
      t,
    ],
  );

  const startPlayback = useCallback(
    async (positionTicks: number, longPress = false) => {
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

      // The button announces the target: the phone's copy matters only to a play here.
      const playsHere =
        resolvePlay({ target, offline: isOffline, longPress }).where === "here";

      // If online but file is downloaded, ask user which version to play
      if (downloadedItem && playsHere) {
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
                      handleNormalPlayFlow(positionTicks, longPress);
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
                  handleNormalPlayFlow(positionTicks, longPress);
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
      handleNormalPlayFlow(positionTicks, longPress);
    },
    [
      item,
      target,
      isOffline,
      handleNormalPlayFlow,
      playMedia,
      t,
      showModal,
      hideModal,
    ],
  );

  const play = useCallback(
    (longPress: boolean) => {
      if (!item) return;

      lightHapticFeedback();

      // Same prompt the TV item page shows: an in-progress item asks whether
      // to resume or restart instead of silently resuming. Users can turn the
      // prompt off in settings, in which case playback resumes right away.
      const progressTicks = item.UserData?.PlaybackPositionTicks ?? 0;
      if (progressTicks > 0 && !settings.showResumeDialog) {
        void startPlayback(progressTicks, longPress);
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
              onPress: () => void startPlayback(0, longPress),
            },
            {
              text: t("item_card.continue_from", {
                time: formatDuration(progressTicks),
              }),
              onPress: () => void startPlayback(progressTicks, longPress),
              isPreferred: true,
            },
          ],
        );
        return;
      }

      void startPlayback(0, longPress);
    },
    [item, lightHapticFeedback, startPlayback, t, settings.showResumeDialog],
  );

  const onPress = useCallback(() => play(false), [play]);

  const destination = resolvePlay({
    target,
    offline: isOffline,
    longPress: false,
  });

  // With a target the long press offers this device; without one there is
  // nothing else to offer.
  const onLongPress = useCallback(() => {
    if (destination.where === "here") return;
    showActionSheetWithOptions(
      {
        options: [t("player.play_here"), t("common.cancel")],
        cancelButtonIndex: 1,
      },
      (selectedIndex) => {
        if (selectedIndex === 0) play(true);
      },
    );
  }, [destination.where, showActionSheetWithOptions, play, t]);

  const targetLabel =
    destination.where === "target"
      ? t("player.play_on", { name: destination.name })
      : destination.where === "waitForTarget"
        ? t("player.connecting_to", { name: destination.name })
        : null;
  const downloadHere =
    destination.where === "here" && destination.reason === "download";

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
    <View className='flex-1'>
      <TouchableOpacity
        disabled={!item || !!disabled}
        accessibilityLabel={t("accessibility.play_button")}
        accessibilityHint={t("accessibility.play_hint")}
        // Where a press plays, for screen readers. Always a value: React Native Android clears the whole
        // content description, label included, once it turns undefined.
        accessibilityValue={{ text: targetLabel ?? "" }}
        accessibilityActions={
          targetLabel
            ? [{ name: "longpress", label: t("player.play_here") }]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "longpress") onLongPress();
        }}
        onPress={onPress}
        onLongPress={onLongPress}
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
              {targetLabel ?? (
                <>
                  {runtimeTicksToMinutes(
                    (item?.RunTimeTicks || 0) -
                      (item?.UserData?.PlaybackPositionTicks || 0),
                  )}
                  {(item?.UserData?.PlaybackPositionTicks || 0) > 0 && " left"}
                </>
              )}
            </Animated.Text>
            <Animated.Text style={animatedTextStyle}>
              <Ionicons name='play-circle' size={24} />
            </Animated.Text>
            {targetLabel && (
              <Animated.Text
                testID='play-button-cast'
                style={animatedTextStyle}
              >
                <Feather name='cast' size={22} />
              </Animated.Text>
            )}
            {/* In a group a play here is for everyone in it. Downloads stay
              solo, and a press for a target leaves the group alone, so
              both keep the plain button. */}
            {inSyncPlayGroup && !isOffline && !targetLabel && (
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
      {downloadHere && (
        <Text className='text-xs text-neutral-400 text-center mt-1'>
          {t("player.download_plays_here")}
        </Text>
      )}
    </View>
  );
};
