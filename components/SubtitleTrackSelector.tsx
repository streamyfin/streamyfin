import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { tc } from "@/utils/textTools";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

interface Props extends React.ComponentProps<typeof View> {
  source?: MediaSourceInfo;
  onChange: (value: number) => void;
  selected?: number | undefined;
}

export const SubtitleTrackSelector: React.FC<Props> = ({
  source,
  onChange,
  selected,
  ...props
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const subtitleStreams = useMemo(() => {
    return source?.MediaStreams?.filter((x) => x.Type === "Subtitle");
  }, [source]);

  const selectedSubtitleSteam = useMemo(
    () => subtitleStreams?.find((x) => x.Index === selected),
    [subtitleStreams, selected],
  );

  const optionGroups: OptionGroup[] = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("item_card.none"),
        value: -1,
        selected: selected === -1,
        onPress: () => onChange(-1),
      },
      ...(subtitleStreams?.map((subtitle, idx) => ({
        type: "radio" as const,
        label: subtitle.DisplayTitle || `Subtitle Stream ${idx + 1}`,
        value: subtitle.Index,
        selected: subtitle.Index === selected,
        onPress: () => onChange(subtitle.Index ?? -1),
      })) || []),
    ];

    return [
      {
        options,
      },
    ];
  }, [subtitleStreams, selected, t, onChange]);

  const handleOptionSelect = (optionId: string) => {
    if (optionId === "none") {
      onChange(-1);
    } else {
      const selectedStream = subtitleStreams?.find(
        (subtitle, idx) => `${subtitle.Index || idx}` === optionId,
      );
      if (
        selectedStream &&
        selectedStream.Index !== undefined &&
        selectedStream.Index !== null
      ) {
        onChange(selectedStream.Index);
      }
    }
    setOpen(false);
  };

  const trigger = (
    <View className='flex flex-col' {...props}>
      <Text numberOfLines={1} className='opacity-50 mb-1 text-xs'>
        {t("item_card.subtitles")}
      </Text>
      <TouchableOpacity
        className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
        onPress={() => setOpen(true)}
      >
        <Text>
          {selectedSubtitleSteam
            ? tc(selectedSubtitleSteam?.DisplayTitle, 7)
            : t("item_card.none")}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (Platform.isTV || subtitleStreams?.length === 0) return null;

  return (
    <PlatformDropdown
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.subtitles")}
      open={open}
      onOpenChange={setOpen}
      onOptionSelect={handleOptionSelect}
      expoUIConfig={{
        hostStyle: { flex: 1 },
      }}
      bottomSheetConfig={{
        enablePanDownToClose: true,
      }}
    />
  );
};
