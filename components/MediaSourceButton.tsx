import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { BITRATES } from "./BitRateSheet";
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

  const audioStreams = useMemo(
    () =>
      selectedOptions.mediaSource?.MediaStreams?.filter(
        (x) => x.Type === "Audio",
      ) || [],
    [selectedOptions.mediaSource],
  );

  const subtitleStreams = useMemo(
    () =>
      selectedOptions.mediaSource?.MediaStreams?.filter(
        (x) => x.Type === "Subtitle",
      ) || [],
    [selectedOptions.mediaSource],
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

    // Audio track group
    if (audioStreams.length > 0) {
      groups.push({
        title: t("item_card.audio"),
        options: audioStreams.map((stream) => ({
          type: "radio" as const,
          label: stream.DisplayTitle || `${t("common.track")} ${stream.Index}`,
          value: stream.Index,
          selected: stream.Index === selectedOptions.audioIndex,
          onPress: () =>
            setSelectedOptions(
              (prev) => prev && { ...prev, audioIndex: stream.Index ?? 0 },
            ),
        })),
      });
    }

    // Subtitle track group (with None option)
    if (subtitleStreams.length > 0) {
      const noneOption = {
        type: "radio" as const,
        label: t("common.none"),
        value: -1,
        selected: selectedOptions.subtitleIndex === -1,
        onPress: () =>
          setSelectedOptions((prev) => prev && { ...prev, subtitleIndex: -1 }),
      };

      const subtitleOptions = subtitleStreams.map((stream) => ({
        type: "radio" as const,
        label: stream.DisplayTitle || `${t("common.track")} ${stream.Index}`,
        value: stream.Index,
        selected: stream.Index === selectedOptions.subtitleIndex,
        onPress: () =>
          setSelectedOptions(
            (prev) => prev && { ...prev, subtitleIndex: stream.Index ?? -1 },
          ),
      }));

      groups.push({
        title: t("item_card.subtitles"),
        options: [noneOption, ...subtitleOptions],
      });
    }

    return groups;
  }, [
    item,
    selectedOptions,
    audioStreams,
    subtitleStreams,
    getMediaSourceDisplayName,
    t,
    setSelectedOptions,
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
