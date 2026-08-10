import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Stepper } from "@/components/inputs/Stepper";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import useRouter from "@/hooks/useAppRouter";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { usePlayerContext } from "../contexts/PlayerContext";
import { useVideoContext } from "../contexts/VideoContext";
import { PlaybackSpeedScope } from "../utils/playback-speed-settings";

const SUBTITLE_SYNC_OFFSETS = [-5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5];
const SUBTITLE_SCALE_MIN = 0.1;
const SUBTITLE_SCALE_MAX = 3;
const SUBTITLE_SCALE_STEPS = 29;

const SubtitleScaleControl = ({ onClose }: { onClose?: () => void }) => {
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const progress = useSharedValue(settings.subtitleSize);
  const minimumValue = useSharedValue(SUBTITLE_SCALE_MIN);
  const maximumValue = useSharedValue(SUBTITLE_SCALE_MAX);
  const disabled = pluginSettings?.subtitleSize?.locked === true;

  useEffect(() => {
    progress.value = settings.subtitleSize;
  }, [progress, settings.subtitleSize]);

  const updateSubtitleScale = useCallback(
    (value: number) => {
      const subtitleSize = Math.round(value * 10) / 10;
      progress.value = subtitleSize;
      updateSettings({ subtitleSize });
    },
    [progress, updateSettings],
  );

  return (
    <View className='px-6 pt-4 pb-6'>
      <View className='flex-row items-center justify-between mb-6'>
        <Text className='text-xl font-bold'>
          {t("player.menu.subtitle_scale")}
        </Text>
        <View className='flex-row items-center gap-3'>
          {Platform.OS === "android" && (
            <Text className='text-base text-neutral-300'>
              {settings.subtitleSize.toFixed(1)}×
            </Text>
          )}
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              className='h-8 w-8 items-center justify-center'
              accessibilityLabel={t("common.close")}
            >
              <Ionicons name='close-circle' size={24} color='#d4d4d4' />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {Platform.OS === "android" ? (
        <View
          className={`flex-row items-center${disabled ? " opacity-50" : ""}`}
        >
          <Text className='text-sm'>A</Text>
          <View
            className='flex-1 mx-4'
            accessible
            accessibilityRole='adjustable'
            accessibilityLabel={t("player.menu.subtitle_scale")}
            accessibilityState={{ disabled }}
            accessibilityValue={{
              min: SUBTITLE_SCALE_MIN,
              max: SUBTITLE_SCALE_MAX,
              now: settings.subtitleSize,
              text: `${settings.subtitleSize.toFixed(1)}×`,
            }}
            accessibilityActions={[
              { name: "decrement" },
              { name: "increment" },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (disabled) return;
              updateSubtitleScale(
                nativeEvent.actionName === "increment"
                  ? Math.min(SUBTITLE_SCALE_MAX, settings.subtitleSize + 0.1)
                  : Math.max(SUBTITLE_SCALE_MIN, settings.subtitleSize - 0.1),
              );
            }}
          >
            <Slider
              progress={progress}
              minimumValue={minimumValue}
              maximumValue={maximumValue}
              steps={SUBTITLE_SCALE_STEPS}
              forceSnapToStep
              disable={disabled}
              sliderHeight={6}
              thumbWidth={24}
              renderBubble={() => null}
              renderMark={() => null}
              onValueChange={updateSubtitleScale}
              containerStyle={{ borderRadius: 100 }}
              theme={{
                minimumTrackTintColor: "#fff",
                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                disableMinTrackTintColor: "rgba(255,255,255,0.35)",
              }}
            />
          </View>
          <Text className='text-xl'>A</Text>
        </View>
      ) : (
        <View className='items-center'>
          <Stepper
            value={settings.subtitleSize}
            disabled={disabled}
            step={0.1}
            min={SUBTITLE_SCALE_MIN}
            max={SUBTITLE_SCALE_MAX}
            appendValue='×'
            formatValue={(value) => value.toFixed(1)}
            onUpdate={updateSubtitleScale}
          />
        </View>
      )}
    </View>
  );
};

interface DropdownViewProps {
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  subtitleDelay?: number;
  onSubtitleDelayChange?: (seconds: number) => void;
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
}

const DropdownView = ({
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  subtitleDelay = 0,
  onSubtitleDelayChange,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
}: DropdownViewProps) => {
  const { subtitleTracks, audioTracks } = useVideoContext();
  const { item, mediaSource } = usePlayerContext();
  const { settings, pluginSettings } = useSettings();
  const subtitleScaleModalRef = useRef<BottomSheetModal>(null);
  const [isSubtitleScaleVisible, setIsSubtitleScaleVisible] = useState(false);
  const router = useRouter();
  const isOffline = useOfflineMode();
  const { t } = useTranslation();

  const { subtitleIndex, audioIndex, bitrateValue, playbackPosition } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
    }>();

  // Use ref to track playbackPosition without causing re-renders
  const playbackPositionRef = useRef(playbackPosition);
  playbackPositionRef.current = playbackPosition;

  // Stabilize IDs to prevent unnecessary recalculations
  const itemIdRef = useRef(item.Id);
  const mediaSourceIdRef = useRef(mediaSource?.Id);
  itemIdRef.current = item.Id;
  mediaSourceIdRef.current = mediaSource?.Id;

  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: itemIdRef.current ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSourceIdRef.current ?? "",
        bitrateValue: bitrate.toString(),
        playbackPosition: playbackPositionRef.current,
      }).toString();
      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [audioIndex, subtitleIndex, router],
  );

  // Create stable identifiers for tracks
  const subtitleTracksKey = useMemo(
    () => subtitleTracks?.map((t) => `${t.index}-${t.name}`).join(",") ?? "",
    [subtitleTracks],
  );

  const audioTracksKey = useMemo(
    () => audioTracks?.map((t) => `${t.index}-${t.name}`).join(",") ?? "",
    [audioTracks],
  );

  const openSubtitleScale = useCallback(() => {
    if (Platform.OS === "android") {
      setIsSubtitleScaleVisible(true);
    } else {
      subtitleScaleModalRef.current?.present();
    }
  }, []);

  const renderSubtitleScaleBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  // Transform sections into OptionGroup format
  const optionGroups = useMemo<OptionGroup[]>(() => {
    const groups: OptionGroup[] = [];

    // Quality Section
    if (!isOffline) {
      groups.push({
        title: t("player.menu.quality"),
        options:
          BITRATES?.map((bitrate) => ({
            type: "radio" as const,
            label: bitrate.key,
            value: bitrate.value?.toString() ?? "",
            selected: bitrateValue === (bitrate.value?.toString() ?? ""),
            onPress: () => changeBitrate(bitrate.value?.toString() ?? ""),
          })) || [],
      });
    }

    // Subtitle Section
    if (subtitleTracks && subtitleTracks.length > 0) {
      groups.push({
        title: t("player.menu.subtitles"),
        options: subtitleTracks.map((sub) => ({
          type: "radio" as const,
          label: sub.name,
          value: sub.index.toString(),
          selected: subtitleIndex === sub.index.toString(),
          onPress: () => sub.setTrack(),
        })),
      });
    }

    // Subtitle Scale Section
    groups.push({
      title: t("player.menu.subtitle_scale"),
      options: [
        {
          type: "action" as const,
          label:
            Platform.OS === "android"
              ? `${settings.subtitleSize.toFixed(1)}×`
              : `${t("player.menu.subtitle_scale")}: ${settings.subtitleSize.toFixed(1)}×`,
          disabled: pluginSettings?.subtitleSize?.locked,
          onPress: openSubtitleScale,
        },
      ],
    });

    if (onSubtitleDelayChange) {
      groups.push({
        title: t("player.subtitle_sync"),
        options: SUBTITLE_SYNC_OFFSETS.map((seconds) => ({
          type: "radio" as const,
          label: `${seconds > 0 ? "+" : ""}${seconds} s`,
          value: seconds.toString(),
          selected: subtitleDelay === seconds,
          onPress: () => onSubtitleDelayChange(seconds),
        })),
      });
    }

    // Audio Section
    if (audioTracks && audioTracks.length > 0) {
      groups.push({
        title: t("player.menu.audio"),
        options: audioTracks.map((track) => ({
          type: "radio" as const,
          label: track.name,
          value: track.index.toString(),
          selected: audioIndex === track.index.toString(),
          onPress: () => track.setTrack(),
        })),
      });
    }

    // Speed Section
    if (setPlaybackSpeed) {
      groups.push({
        title: t("player.menu.speed"),
        options: PLAYBACK_SPEEDS.map((speed) => ({
          type: "radio" as const,
          label: speed.label,
          value: speed.value.toString(),
          selected: playbackSpeed === speed.value,
          onPress: () => setPlaybackSpeed(speed.value, PlaybackSpeedScope.All),
        })),
      });
    }

    // Technical Info (at bottom)
    if (onToggleTechnicalInfo) {
      groups.push({
        options: [
          {
            type: "action" as const,
            label: showTechnicalInfo
              ? t("player.menu.hide_technical_info")
              : t("player.menu.show_technical_info"),
            onPress: onToggleTechnicalInfo,
          },
        ],
      });
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    t,
    isOffline,
    bitrateValue,
    changeBitrate,
    subtitleTracksKey,
    audioTracksKey,
    subtitleIndex,
    audioIndex,
    settings.subtitleSize,
    pluginSettings?.subtitleSize?.locked,
    openSubtitleScale,
    playbackSpeed,
    setPlaybackSpeed,
    subtitleDelay,
    onSubtitleDelayChange,
    showTechnicalInfo,
    onToggleTechnicalInfo,
    // Note: subtitleTracks and audioTracks are intentionally excluded
    // because we use subtitleTracksKey and audioTracksKey for stability
  ]);

  // Memoize the trigger to prevent re-renders
  const trigger = useMemo(
    () => (
      <View className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'>
        <Ionicons name='ellipsis-horizontal' size={24} color={"white"} />
      </View>
    ),
    [],
  );

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <>
      <PlatformDropdown
        title={t("player.menu.playback_options")}
        groups={optionGroups}
        trigger={trigger}
        expoUIConfig={{}}
        bottomSheetConfig={{
          enablePanDownToClose: true,
        }}
      />
      {Platform.OS === "android" ? (
        <Modal
          transparent
          statusBarTranslucent
          navigationBarTranslucent
          visible={isSubtitleScaleVisible}
          animationType='fade'
          onRequestClose={() => setIsSubtitleScaleVisible(false)}
        >
          <GestureHandlerRootView style={styles.subtitleScaleModal}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setIsSubtitleScaleVisible(false)}
            />
            <View style={styles.subtitleScaleOverlay}>
              <SubtitleScaleControl
                onClose={() => setIsSubtitleScaleVisible(false)}
              />
            </View>
          </GestureHandlerRootView>
        </Modal>
      ) : (
        <BottomSheetModal
          ref={subtitleScaleModalRef}
          enableDynamicSizing
          enablePanDownToClose
          stackBehavior='push'
          backdropComponent={renderSubtitleScaleBackdrop}
          backgroundStyle={{ backgroundColor: "#171717" }}
          handleIndicatorStyle={{ backgroundColor: "white" }}
        >
          <SubtitleScaleControl />
        </BottomSheetModal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  subtitleScaleModal: {
    flex: 1,
    alignItems: "center",
    paddingTop: 64,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  subtitleScaleOverlay: {
    width: "50%",
    maxWidth: 520,
    minWidth: 360,
    borderRadius: 16,
    backgroundColor: "rgba(23,23,23,0.94)",
    elevation: 12,
  },
});

export default DropdownView;
