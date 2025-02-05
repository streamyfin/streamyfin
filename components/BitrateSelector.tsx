import { TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "./common/Text";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

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
].sort((a, b) => (b.value || Infinity) - (a.value || Infinity));

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
  const sorted = useMemo(() => {
    if (inverted)
      return BITRATES.sort(
        (a, b) => (a.value || Infinity) - (b.value || Infinity)
      );
    return BITRATES.sort(
      (a, b) => (b.value || Infinity) - (a.value || Infinity)
    );
  }, []);

  const { t } = useTranslation();

  return (
    <View
      className="flex shrink"
      style={{
        minWidth: 60,
        maxWidth: 200,
      }}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <View className="flex flex-col" {...props}>
            <Text className="opacity-50 mb-1 text-xs">
              {t("item_card.quality")}
            </Text>
            <TouchableOpacity className="bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between">
              <Text style={{}} className="" numberOfLines={1}>
                {BITRATES.find((b) => b.value === selected?.value)?.key}
              </Text>
            </TouchableOpacity>
          </View>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          loop={false}
          side="bottom"
          align="center"
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
