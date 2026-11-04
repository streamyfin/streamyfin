import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import {
  AUTO_BITRATE,
  bitrateLabel,
  isAutoBitrate,
  MAX_BITRATE,
} from "@/utils/bitrate";
import { Text } from "./common/Text";
import { type OptionGroup, PlatformDropdown } from "./PlatformDropdown";

export type Bitrate = {
  key: string;
  value: number | undefined;
};

export const BITRATES: Bitrate[] = [
  // The default, measured on the connection to the server when a stream is
  // asked for (utils/jellyfin/bitrateTest.ts).
  AUTO_BITRATE,
  ...[
    MAX_BITRATE,
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
  ),
];

/**
 * The qualities as the settings and the item pages offer them, on the phone
 * and on TV. Told apart by key: neither Auto nor Max carries a bitrate.
 */
export const bitrateOptions = (
  t: TFunction,
  selected?: Pick<Bitrate, "key"> | null,
) =>
  BITRATES.map((bitrate) => ({
    label: bitrateLabel(t, bitrate),
    value: bitrate,
    selected: bitrate.key === selected?.key,
  }));

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
    // Only the download sheet picks from here, and a download is a file: it
    // has no connection to measure, so it is not offered Auto.
    const qualities = BITRATES.filter((bitrate) => !isAutoBitrate(bitrate));
    if (inverted)
      return qualities.sort(
        (a, b) =>
          (a.value || Number.POSITIVE_INFINITY) -
          (b.value || Number.POSITIVE_INFINITY),
      );
    return qualities.sort(
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
          selected: bitrate.key === selected?.key,
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
