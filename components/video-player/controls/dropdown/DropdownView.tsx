import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import useRouter from "@/hooks/useAppRouter";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { usePlayerContext } from "../contexts/PlayerContext";
import { useVideoContext } from "../contexts/VideoContext";
import { PlaybackSpeedScope } from "../utils/playback-speed-settings";
import {
  type OptionGroup,
  PlayerSettingsPopover,
} from "./PlayerSettingsPopover";

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
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const isOffline = useOfflineMode();

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

  // Transform sections into OptionGroup format
  const optionGroups = useMemo<OptionGroup[]>(() => {
    const groups: OptionGroup[] = [];

    // Quality Section
    if (!isOffline) {
      groups.push({
        title: "Quality",
        icon: "gauge.with.dots.needle.50percent",
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

    // Subtitles section. iOS: tap the `...` opens a SwiftUI Popover with the
    // section header "SUBTITLES" + a Track row (Menu) + a Size row (native
    // Slider). Android: same shape in a bottom-sheet — tap the "Track" row to
    // expand the list inline, Size shows a Material 3 Slider.
    if (subtitleTracks && subtitleTracks.length > 0) {
      groups.push({
        title: "Subtitles",
        options: [
          {
            type: "subgroup" as const,
            label: "Track",
            icon: "captions.bubble",
            options: subtitleTracks.map((sub) => ({
              type: "radio" as const,
              label: sub.name,
              value: sub.index.toString(),
              selected: subtitleIndex === sub.index.toString(),
              onPress: () => sub.setTrack(),
            })),
          },
          {
            type: "slider" as const,
            label: "Size",
            icon: "textformat.size",
            value: Math.round((settings.mpvSubtitleScale ?? 1.0) * 10) / 10,
            step: 0.1,
            min: 0.1,
            max: 3.0,
            format: (v: number) => `${v.toFixed(1)}x`,
            onValueChange: (value: number) =>
              updateSettings({
                mpvSubtitleScale: Math.round(value * 10) / 10,
              }),
          },
        ],
      });
    }

    // Audio Section
    if (audioTracks && audioTracks.length > 0) {
      groups.push({
        title: "Audio",
        icon: "speaker.wave.2",
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
        title: "Speed",
        icon: "speedometer",
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
              ? "Hide Technical Info"
              : "Show Technical Info",
            icon: "info.circle",
            onPress: onToggleTechnicalInfo,
          },
        ],
      });
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOffline,
    bitrateValue,
    changeBitrate,
    subtitleTracksKey,
    audioTracksKey,
    subtitleIndex,
    audioIndex,
    settings.mpvSubtitleScale,
    updateSettings,
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
    <PlayerSettingsPopover
      title='Playback Options'
      groups={optionGroups}
      trigger={trigger}
      expoUIConfig={{}}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};

export default DropdownView;
