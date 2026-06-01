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
  MediaPlayerState,
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
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { itemThemeColorAtom } from "@/utils/atoms/primaryColor";
import { useSettings } from "@/utils/atoms/settings";
import { loadCastMedia } from "@/utils/casting/castLoad";
import { runtimeTicksToMinutes } from "@/utils/time";
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
  const castDevice = useCastDevice();
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

  const handleNormalPlayFlow = useCallback(async () => {
    if (!item) return;

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

    const options = [
      t("casting_player.chromecast"),
      t("casting_player.device"),
      t("casting_player.cancel"),
    ];
    const cancelButtonIndex = 2;
    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      async (selectedIndex: number | undefined) => {
        if (!api) return;
        // Compare item IDs AND check if media is actually playing (not stopped/idle)
        const currentContentId = mediaStatus?.mediaInfo?.contentId;
        const isMediaActive =
          mediaStatus?.playerState === MediaPlayerState.PLAYING ||
          mediaStatus?.playerState === MediaPlayerState.PAUSED ||
          mediaStatus?.playerState === MediaPlayerState.BUFFERING;
        const isOpeningCurrentlyPlayingMedia =
          isMediaActive && currentContentId && currentContentId === item?.Id;

        switch (selectedIndex) {
          case 0:
            await CastContext.getPlayServicesState().then(async (state) => {
              if (state && state !== PlayServicesState.SUCCESS) {
                CastContext.showPlayServicesErrorDialog(state);
              } else {
                if (!api || !user?.Id || !item?.Id) {
                  console.warn("Missing parameters for Chromecast streaming");
                  Alert.alert(
                    t("player.client_error"),
                    t("player.missing_parameters"),
                  );
                  return;
                }

                const startPositionMs =
                  (item.UserData?.PlaybackPositionTicks ?? 0) / 10000;

                const result = await loadCastMedia({
                  client,
                  device: castDevice,
                  api,
                  item,
                  userId: user.Id,
                  profileMode: settings.chromecastProfile,
                  maxBitrateSetting: settings.chromecastMaxBitrate,
                  options: {
                    audioStreamIndex: selectedOptions.audioIndex,
                    subtitleStreamIndex: selectedOptions.subtitleIndex,
                    maxBitrate: selectedOptions.bitrate?.value,
                    mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
                    startPositionMs,
                  },
                });

                if (!result.ok) {
                  console.error("[PlayButton] cast load failed:", result.error);
                  Alert.alert(
                    t("player.client_error"),
                    t("player.could_not_create_stream_for_chromecast"),
                  );
                  return;
                }

                if (!isOpeningCurrentlyPlayingMedia) {
                  router.push("/casting-player");
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
    castDevice,
    settings,
    api,
    user,
    router,
    showActionSheetWithOptions,
    mediaStatus,
    selectedOptions,
    goToPlayer,
    isOffline,
    t,
  ]);

  const onPress = useCallback(async () => {
    if (!item) return;

    lightHapticFeedback();

    // Check if item is downloaded
    const downloadedItem = item.Id ? getDownloadedItemById(item.Id) : undefined;

    // If already in offline mode, play downloaded file directly
    if (isOffline && downloadedItem) {
      const queryParams = new URLSearchParams({
        itemId: item.Id!,
        offline: "true",
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
      });
      goToPlayer(queryParams.toString());
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
                    const queryParams = new URLSearchParams({
                      itemId: item.Id!,
                      offline: "true",
                      playbackPosition:
                        item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
                    });
                    goToPlayer(queryParams.toString());
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
                    handleNormalPlayFlow();
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
                const queryParams = new URLSearchParams({
                  itemId: item.Id!,
                  offline: "true",
                  playbackPosition:
                    item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
                });
                goToPlayer(queryParams.toString());
              },
              isPreferred: true,
            },
            {
              text: t("player.downloaded_file_no"),
              onPress: () => {
                handleNormalPlayFlow();
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
    handleNormalPlayFlow();
  }, [
    item,
    lightHapticFeedback,
    handleNormalPlayFlow,
    goToPlayer,
    t,
    showModal,
    hideModal,
    effectiveColors,
  ]);

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
      accessibilityLabel='Play button'
      accessibilityHint='Tap to play the media'
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
