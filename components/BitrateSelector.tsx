import { Platform, TouchableOpacity, View } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  if (Platform.isTV) return null;
  const sorted = useMemo(() => {
    if (inverted)
      return BITRATES.sort(
        (a, b) =>
          (a.value || Number.POSITIVE_INFINITY) -
          (b.value || Number.POSITIVE_INFINITY),
      );
    return BITRATES.sort(
      (a, b) =>
        (b.value || Number.POSITIVE_INFINITY) -
        (a.value || Number.POSITIVE_INFINITY),
    );
  }, []);

  const { t } = useTranslation();

  return (
    <View
      className='flex shrink'
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className='flex flex-col' {...props}>
            <Text className='opacity-50 mb-1 text-xs'>
              {t("item_card.quality")}
            </Text>
            <TouchableOpacity className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'>
              <Text style={{}} className='' numberOfLines={1}>
                {BITRATES.find((b) => b.value === selected?.value)?.key}
              </Text>
            </TouchableOpacity>
          </View>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={false}
          side='bottom'
          align='center'
          alignOffset={0}
          avoidCollisions={true}
          collisionPadding={0}
          sideOffset={0}
        >
          <DropdownMenu.Label>Bitrates</DropdownMenu.Label>
          {sorted.map((b) => (
            <DropdownMenu.Item
              key={b.key}
              onSelect={() => {
                onChange(b);
              }}
            >
              <DropdownMenu.ItemTitle>{b.key}</DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </View>
  );
};
