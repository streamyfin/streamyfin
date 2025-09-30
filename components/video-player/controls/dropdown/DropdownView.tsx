import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Platform, View } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { useControlContext } from "../contexts/ControlContext";
import { useVideoContext } from "../contexts/VideoContext";

const DropdownView = () => {
  const videoContext = useVideoContext();
  const { subtitleTracks, audioTracks } = videoContext;
  const ControlContext = useControlContext();
  const [item, mediaSource] = [
    ControlContext?.item,
    ControlContext?.mediaSource,
  ];
  const router = useRouter();

  const { subtitleIndex, audioIndex, bitrateValue, playbackPosition, offline } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
      offline: string;
    }>();

  // Use ref to track playbackPosition without causing re-renders
  const playbackPositionRef = useRef(playbackPosition);
  playbackPositionRef.current = playbackPosition;

  const isOffline = offline === "true";

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
        title: "Subtitles",
        options: subtitleTracks.map((sub) => ({
          type: "radio" as const,
          label: sub.name,
          value: sub.index.toString(),
          selected: subtitleIndex === sub.index.toString(),
          onPress: () => sub.setTrack(),
        })),
      });
    }

    // Audio Section
    if (audioTracks && audioTracks.length > 0) {
      groups.push({
        title: "Audio",
        options: audioTracks.map((track) => ({
          type: "radio" as const,
          label: track.name,
          value: track.index.toString(),
          selected: audioIndex === track.index.toString(),
          onPress: () => track.setTrack(),
        })),
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
    <PlatformDropdown
      title='Playback Options'
      groups={optionGroups}
      trigger={trigger}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};

export default DropdownView;
