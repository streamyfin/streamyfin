import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { BITRATES, type Bitrate } from "@/constants/Playback";
import { bitrateLabel, PLAYBACK_BITRATES } from "@/utils/bitrate";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

// The list moved to constants/Playback.ts, which utils read without this
// component's UI.
export type { Bitrate } from "@/constants/Playback";
export { BITRATES };

/**
 * The qualities as the settings and the item pages offer them, on the phone
 * and on TV, Auto first. Told apart by key: neither Auto nor Max carries a
 * bitrate.
 */
export const bitrateOptions = (
  t: TFunction,
  selected?: Pick<Bitrate, "key"> | null,
) =>
  PLAYBACK_BITRATES.map((bitrate) => ({
    label: bitrateLabel(t, bitrate),
    value: bitrate,
    selected: bitrate.key === selected?.key,
  }));

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: Bitrate) => void;
  selected?: Bitrate | null;
}

export const BitrateSelector: React.FC<Props> = ({
  onChange,
  selected,
  ...props
}) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        options: BITRATES.map((bitrate) => ({
          type: "radio" as const,
          label: bitrate.key,
          value: bitrate,
          selected: bitrate.key === selected?.key,
          onPress: () => onChange(bitrate),
        })),
      },
    ],
    [selected, onChange],
  );

  const handleOptionSelect = (optionId: string) => {
    const selectedBitrate = BITRATES.find((b) => b.key === optionId);
    if (selectedBitrate) {
      onChange(selectedBitrate);
    }
    setOpen(false);
  };

  const trigger = (
    <View className='flex flex-col' {...props}>
      <Text className='opacity-50 mb-1 text-xs'>{t("item_card.quality")}</Text>
      <TouchableOpacity
        className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
        onPress={() => setOpen(true)}
      >
        <Text numberOfLines={1}>
          {BITRATES.find((b) => b.key === selected?.key)?.key}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (isTv) return null;

  return (
    <PlatformDropdown
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.quality")}
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
