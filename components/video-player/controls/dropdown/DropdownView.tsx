import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, Platform, View } from "react-native";
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

const SubtitleScaleControl = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();

  return (
    <BottomSheetView>
      <View className='px-6 pt-2 pb-8'>
        <Text className='text-xl font-bold mb-6'>
          {t("player.menu.subtitle_scale")}
        </Text>
        <View className='items-center'>
          <Stepper
            value={settings.subtitleSize}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={0.1}
            min={0.1}
            max={3}
            appendValue='×'
            formatValue={(value) => value.toFixed(1)}
            onUpdate={(value) =>
              updateSettings({ subtitleSize: Number(value.toFixed(1)) })
            }
          />
        </View>
      </View>
    </BottomSheetView>
  );
};

interface DropdownViewProps {
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
}

const DropdownView = ({
  playbackSpeed = 1.0,
  setPlaybackSpeed,
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
    subtitleScaleModalRef.current?.present();
  }, []);

  useEffect(() => {
    if (!isSubtitleScaleVisible || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        subtitleScaleModalRef.current?.dismiss();
        return true;
      },
    );
    return () => subscription.remove();
  }, [isSubtitleScaleVisible]);

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
      <BottomSheetModal
        ref={subtitleScaleModalRef}
        enableDynamicSizing
        enablePanDownToClose
        stackBehavior='push'
        backdropComponent={renderSubtitleScaleBackdrop}
        onChange={(index) => setIsSubtitleScaleVisible(index >= 0)}
        backgroundStyle={{ backgroundColor: "#171717" }}
        handleIndicatorStyle={{ backgroundColor: "white" }}
      >
        <SubtitleScaleControl />
      </BottomSheetModal>
    </>
  );
};

export default DropdownView;
