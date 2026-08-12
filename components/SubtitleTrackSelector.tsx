import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";
import { buildSubtitleMenu } from "@/utils/subtitles/trackMenu";
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

  const rows = useMemo(
    () =>
      buildSubtitleMenu(source?.MediaStreams, {
        selectedIndex: selected ?? SUBTITLES_OFF,
        offLabel: t("item_card.none"),
        isTranscoding: Boolean(source?.TranscodingUrl),
        formatLabel: (s) => s.DisplayTitle || `Subtitle Stream ${s.Index}`,
      }),
    [source, selected, t],
  );

  const selectedRow = useMemo(
    () => rows.find((r) => r.kind === "server" && r.selected),
    [rows],
  );

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        options: rows.map((row) => ({
          type: "radio" as const,
          label: row.label,
          value: row.index,
          selected: row.selected,
          onPress: () => onChange(row.index),
        })),
      },
    ],
    [rows, onChange],
  );

  // Row indexes are the identity, so the id round-trips without the old
  // `Index || idx` fallback — which collapsed index 0 onto the array position.
  const handleOptionSelect = (optionId: string) => {
    const row = rows.find((r) => String(r.index) === optionId);
    if (row) onChange(row.index);
    setOpen(false);
  };

  const trigger = (
    <View className='flex flex-col' {...props}>
      <Text numberOfLines={1} className='opacity-50 mb-1 text-xs'>
        {t("item_card.subtitles.label")}
      </Text>
      <TouchableOpacity
        className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
        onPress={() => setOpen(true)}
      >
        <Text>
          {selectedRow ? tc(selectedRow.label, 7) : t("item_card.none")}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // "Off" is always present, so emptiness is about the server tracks.
  if (Platform.isTV || !rows.some((r) => r.kind === "server")) return null;

  return (
    <PlatformDropdown
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.subtitles.label")}
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
