import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import SelectBottomSheet, {
  type SelectOptionGroup,
} from "./common/SelectBottomSheet";
import { Text } from "./common/Text";

export type Bitrate = {
  key: string;
  value: number | undefined;
};

export const BITRATES: Bitrate[] = [
  {
    key: "Max",
    value: undefined,
  },
  {
    key: "8 Mb/s",
    value: 8000000,
    height: 1080,
  },
  {
    key: "4 Mb/s",
    value: 4000000,
    height: 1080,
  },
  {
    key: "2 Mb/s",
    value: 2000000,
  },
  {
    key: "1 Mb/s",
    value: 1000000,
  },
  {
    key: "500 Kb/s",
    value: 500000,
  },
  {
    key: "250 Kb/s",
    value: 250000,
  },
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

  const optionGroups = useMemo((): SelectOptionGroup[] => {
    return [
      {
        id: "bitrates",
        title: "Quality",
        options: sorted.map((bitrate) => ({
          id: bitrate.key,
          label: bitrate.key,
          value: bitrate.value,
          selected: selected?.value === bitrate.value,
          onSelect: () => onChange(bitrate),
        })),
      },
    ];
  }, [sorted, selected, onChange]);

  const customTrigger = (
    <View className='flex flex-col' {...props}>
      <Text className='opacity-50 mb-1 text-xs'>{t("item_card.quality")}</Text>
      <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
        <Text style={{}} className='' numberOfLines={1}>
          {BITRATES.find((b) => b.value === selected?.value)?.key}
        </Text>
      </View>
    </View>
  );

  if (isTv) return null;

  return (
    <View
      className='flex shrink'
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <SelectBottomSheet
        title='Quality'
        subtitle='Select video quality'
        groups={optionGroups}
        customTrigger={customTrigger}
      />
    </View>
  );
};
