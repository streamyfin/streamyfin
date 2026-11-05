import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import type { Bitrate } from "@/constants/Playback";
import { BITRATES } from "@/constants/Playback";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

// The list moved to constants/Playback.ts, which utils read without this component's UI.
export type { Bitrate } from "@/constants/Playback";
export { BITRATES };

interface Props extends React.ComponentProps<typeof View> {
  onChange: (value: Bitrate) => void;
  selected?: Bitrate | null;
  inverted?: boolean | null;
}

export const BitrateSelector: React.FC<Props> = ({
  onChange,
  selected,
  inverted,
  ...props
}) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  const sorted = useMemo(() => {
    if (inverted)
      return BITRATES.slice().sort(
        (a, b) =>
          (a.value || Number.POSITIVE_INFINITY) -
          (b.value || Number.POSITIVE_INFINITY),
      );
    return BITRATES.slice().sort(
      (a, b) =>
        (b.value || Number.POSITIVE_INFINITY) -
        (a.value || Number.POSITIVE_INFINITY),
    );
  }, [inverted]);

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        options: sorted.map((bitrate) => ({
          type: "radio" as const,
          label: bitrate.key,
          value: bitrate,
          selected: bitrate.value === selected?.value,
          onPress: () => onChange(bitrate),
        })),
      },
    ],
    [sorted, selected, onChange],
  );

  const handleOptionSelect = (optionId: string) => {
    const selectedBitrate = sorted.find((b) => b.key === optionId);
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
          {BITRATES.find((b) => b.value === selected?.value)?.key}
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
