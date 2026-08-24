import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { useSettings } from "@/utils/atoms/settings";
import { rememberSeriesTrackFromRow } from "@/utils/seriesTrackMemory";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { buildAudioMenu, buildSubtitleMenu } from "@/utils/subtitles/trackMenu";
import { BITRATES } from "./BitrateSelector";
import type { SelectedOptions } from "./ItemContent";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item?: BaseItemDto | null;
  selectedOptions: SelectedOptions;
  setSelectedOptions: React.Dispatch<
    React.SetStateAction<SelectedOptions | undefined>
  >;
  colors?: ThemeColors;
}

export const MediaSourceButton: React.FC<Props> = ({
  item,
  selectedOptions,
  setSelectedOptions,
  colors,
}: Props) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);

  const effectiveColors = colors || {
    primary: "#7c3aed",
    text: "#000000",
  };

  useEffect(() => {
    const firstMediaSource = item?.MediaSources?.[0];
    if (!firstMediaSource) return;
    setSelectedOptions((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mediaSource: firstMediaSource,
      };
    });
  }, [item, setSelectedOptions]);

  const getMediaSourceDisplayName = useCallback((source: MediaSourceInfo) => {
    const videoStream = source.MediaStreams?.find((x) => x.Type === "Video");
    if (source.Name) return source.Name;
    if (videoStream?.DisplayTitle) return videoStream.DisplayTitle;
    return `Source ${source.Id}`;
  }, []);

  const trackLabel = useCallback(
    (s: MediaStream) => s.DisplayTitle || `${t("common.track")} ${s.Index}`,
    [t],
  );

  const audioRows = useMemo(
    () =>
      buildAudioMenu(selectedOptions.mediaSource?.MediaStreams, {
        selectedIndex: selectedOptions.audioIndex,
        isTranscoding: Boolean(selectedOptions.mediaSource?.TranscodingUrl),
        formatLabel: trackLabel,
      }),
    [selectedOptions.mediaSource, selectedOptions.audioIndex, trackLabel],
  );

  const subtitleRows = useMemo(
    () =>
      buildSubtitleMenu(selectedOptions.mediaSource?.MediaStreams, {
        selectedIndex: selectedOptions.subtitleIndex ?? SUBTITLES_OFF,
        offLabel: t("common.none"),
        isTranscoding: Boolean(selectedOptions.mediaSource?.TranscodingUrl),
        formatLabel: trackLabel,
      }),
    [selectedOptions.mediaSource, selectedOptions.subtitleIndex, trackLabel, t],
  );

  const optionGroups: OptionGroup[] = useMemo(() => {
    const groups: OptionGroup[] = [];

    // Bitrate group
    groups.push({
      title: t("item_card.quality"),
      options: BITRATES.map((bitrate) => ({
        type: "radio" as const,
        label: bitrate.key,
        value: bitrate,
        selected: bitrate.value === selectedOptions.bitrate?.value,
        onPress: () =>
          setSelectedOptions((prev) => prev && { ...prev, bitrate }),
      })),
    });

    // Media Source group (only if multiple sources)
    if (item?.MediaSources && item.MediaSources.length > 1) {
      groups.push({
        title: t("item_card.video"),
        options: item.MediaSources.map((source) => ({
          type: "radio" as const,
          label: getMediaSourceDisplayName(source),
          value: source,
          selected: source.Id === selectedOptions.mediaSource?.Id,
          onPress: () =>
            setSelectedOptions(
              (prev) => prev && { ...prev, mediaSource: source },
            ),
        })),
      });
    }

    // A pick here is as deliberate as one made inside the player, so it feeds
    // the per-series memory the same way — otherwise the next episode comes
    // back on the server's default track.
    if (audioRows.length > 0) {
      groups.push({
        title: t("item_card.audio"),
        options: audioRows.map((row) => ({
          type: "radio" as const,
          label: row.label,
          value: row.index,
          selected: row.selected,
          onPress: () => {
            setSelectedOptions(
              (prev) => prev && { ...prev, audioIndex: row.index },
            );
            rememberSeriesTrackFromRow({
              item,
              kind: "audio",
              row,
              settings,
            });
          },
        })),
      });
    }

    if (subtitleRows.some((r) => r.kind === "server")) {
      const [noneOption, ...subtitleOptions] = subtitleRows.map((row) => ({
        type: "radio" as const,
        label: row.label,
        value: row.index,
        selected: row.selected,
        onPress: () => {
          setSelectedOptions(
            (prev) => prev && { ...prev, subtitleIndex: row.index },
          );
          rememberSeriesTrackFromRow({
            item,
            kind: "subtitle",
            row,
            settings,
          });
        },
      }));

      groups.push({
        title: t("item_card.subtitles.label"),
        options: [noneOption, ...subtitleOptions],
      });
    }

    return groups;
  }, [
    item,
    selectedOptions,
    audioRows,
    subtitleRows,
    getMediaSourceDisplayName,
    t,
    setSelectedOptions,
    settings,
  ]);

  const trigger = (
    <TouchableOpacity
      disabled={!item}
      onPress={() => setOpen(true)}
      className='relative'
    >
      <View
        style={{ backgroundColor: effectiveColors.primary, opacity: 0.7 }}
        className='absolute w-12 h-12 rounded-full'
      />
      <View className='w-12 h-12 rounded-full z-10 items-center justify-center'>
        {!item ? (
          <ActivityIndicator size='small' color={effectiveColors.text} />
        ) : (
          <Ionicons name='list' size={24} color={effectiveColors.text} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <PlatformDropdown
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.media_options")}
      open={open}
      onOpenChange={setOpen}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
