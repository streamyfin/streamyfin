import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { BITRATES } from "@/components/BitrateSelector";
import SelectBottomSheet, {
  type SelectOptionGroup,
} from "@/components/common/SelectBottomSheet";
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

  const isOffline = offline === "true";

  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: item.Id ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "",
        bitrateValue: bitrate.toString(),
        playbackPosition: playbackPosition,
      }).toString();
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
    },
    [item, mediaSource, subtitleIndex, audioIndex, playbackPosition],
  );

  const optionGroups = useMemo((): SelectOptionGroup[] => {
    const groups: SelectOptionGroup[] = [];

    // Quality group (only if not offline)
    if (!isOffline && BITRATES) {
      groups.push({
        id: "quality",
        title: "Quality",
        options: BITRATES.map((bitrate) => ({
          id: `quality-${bitrate.value}`,
          label: bitrate.key,
          value: bitrate.value,
          selected: bitrateValue === (bitrate.value?.toString() ?? ""),
          onSelect: () => changeBitrate(bitrate.value?.toString() ?? ""),
        })),
      });
    }

    // Subtitle group
    if (subtitleTracks && subtitleTracks.length > 0) {
      groups.push({
        id: "subtitle",
        title: "Subtitle",
        options: subtitleTracks.map((sub) => ({
          id: `subtitle-${sub.index}`,
          label: sub.name,
          value: sub.index,
          selected: subtitleIndex === sub.index.toString(),
          onSelect: () => sub.setTrack(),
        })),
      });
    }

    // Audio group
    if (audioTracks && audioTracks.length > 0) {
      groups.push({
        id: "audio",
        title: "Audio",
        options: audioTracks.map((track) => ({
          id: `audio-${track.index}`,
          label: track.name,
          value: track.index,
          selected: audioIndex === track.index.toString(),
          onSelect: () => track.setTrack(),
        })),
      });
    }

    return groups;
  }, [
    isOffline,
    bitrateValue,
    subtitleTracks,
    subtitleIndex,
    audioTracks,
    audioIndex,
    changeBitrate,
  ]);

  return (
    <SelectBottomSheet
      title='Player Options'
      subtitle='Select quality, audio, and subtitle options'
      groups={optionGroups}
      triggerIcon='ellipsis-horizontal'
      triggerSize={24}
      triggerColor='white'
    />
  );
};

export default DropdownView;
