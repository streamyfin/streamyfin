import { useMemo, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";

type Props<T extends string | number> = {
  title: string;
  options: readonly { value: T; label: string }[];
  selected: T;
  onChange: (value: T) => void;
};

/** A labelled picker drawn like the quality one in the download sheet. */
export const DownloadOptionSelector = <T extends string | number>({
  title,
  options,
  selected,
  onChange,
}: Props<T>) => {
  const [open, setOpen] = useState(false);

  const groups: OptionGroup[] = useMemo(
    () => [
      {
        options: options.map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === selected,
          onPress: () => onChange(option.value),
        })),
      },
    ],
    [options, selected, onChange],
  );

  return (
    <PlatformDropdown
      groups={groups}
      title={title}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <View className='flex flex-col'>
          <Text className='opacity-50 mb-1 text-xs'>{title}</Text>
          <TouchableOpacity
            className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
            onPress={() => setOpen(true)}
          >
            <Text numberOfLines={1}>
              {options.find((option) => option.value === selected)?.label}
            </Text>
          </TouchableOpacity>
        </View>
      }
      bottomSheetConfig={{ enablePanDownToClose: true }}
    />
  );
};
