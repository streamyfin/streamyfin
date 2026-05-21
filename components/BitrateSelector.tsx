import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

export type Bitrate = {
  key: string;
  value: number | undefined;
};

export const BITRATES: Bitrate[] = [
  { key: "Max", value: undefined },
  { key: "200 Mb/s", value: 200000000 },
  { key: "180 Mb/s", value: 180000000 },
  { key: "140 Mb/s", value: 140000000 },
  { key: "120 Mb/s", value: 120000000 },
  { key: "110 Mb/s", value: 110000000 },
  { key: "100 Mb/s", value: 100000000 },
  { key: "90 Mb/s", value: 90000000 },
  { key: "80 Mb/s", value: 80000000 },
  { key: "70 Mb/s", value: 70000000 },
  { key: "60 Mb/s", value: 60000000 },
  { key: "50 Mb/s", value: 50000000 },
  { key: "40 Mb/s", value: 40000000 },
  { key: "30 Mb/s", value: 30000000 },
  { key: "20 Mb/s", value: 20000000 },
  { key: "15 Mb/s", value: 15000000 },
  { key: "10 Mb/s", value: 10000000 },
  { key: "8 Mb/s", value: 8000000 },
  { key: "5 Mb/s", value: 5000000 },
  { key: "4 Mb/s", value: 4000000 },
  { key: "3 Mb/s", value: 3000000 },
  { key: "2 Mb/s", value: 2000000 },
  { key: "1 Mb/s", value: 1000000 },
  { key: "720 Kb/s", value: 720000 },
  { key: "420 Kb/s", value: 420000 },
].sort(
  (a, b) =>
    (b.value || Number.POSITIVE_INFINITY) -
    (a.value || Number.POSITIVE_INFINITY),
);

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
