import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./common/Text";
import { FilterSheet } from "./filters/FilterSheet";

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

export const BitrateSheet: React.FC<Props> = ({
  onChange,
  selected,
  inverted,
  ...props
}) => {
  const isTv = Platform.isTV;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

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

  if (isTv) return null;

  return (
    <View
      className='flex shrink'
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <View className='flex flex-col' {...props}>
        <Text className='opacity-50 mb-1 text-xs'>
          {t("item_card.quality")}
        </Text>
        <TouchableOpacity
          className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
          onPress={() => setOpen(true)}
        >
          <Text numberOfLines={1}>
            {BITRATES.find((b) => b.value === selected?.value)?.key}
          </Text>
        </TouchableOpacity>
      </View>

      <FilterSheet
        open={open}
        setOpen={setOpen}
        title={t("item_card.quality")}
        data={sorted}
        values={selected ? [selected] : []}
        multiple={false}
        searchFilter={(item, query) => {
          const label = (item as any).key || "";
          return label.toLowerCase().includes(query.toLowerCase());
        }}
        renderItemLabel={(item) => <Text>{(item as any).key || ""}</Text>}
        set={(vals) => {
          const chosen = vals[0] as Bitrate | undefined;
          if (chosen) onChange(chosen);
        }}
      />
    </View>
  );
};
