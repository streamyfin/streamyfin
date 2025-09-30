import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { type OptionGroup, PlatformDropdown } from "../PlatformDropdown";

interface Props<T> {
  data: T[];
  disabled?: boolean;
  placeholderText?: string;
  keyExtractor: (item: T) => string;
  titleExtractor: (item: T) => string | undefined;
  title: string | ReactNode;
  label: string;
  onSelected: (...item: T[]) => void;
  multiple?: boolean;
}

const Dropdown = <T,>({
  data,
  disabled,
  placeholderText,
  keyExtractor,
  titleExtractor,
  title,
  label,
  onSelected,
  multiple = false,
  ...props
}: PropsWithChildren<Props<T> & ViewProps>) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<T[]>();

  useEffect(() => {
    if (selected !== undefined) {
      onSelected(...selected);
    }
  }, [selected, onSelected]);

  const handleOptionSelect = (optionId: string, value?: any) => {
    const selectedItem = data.find((item) => keyExtractor(item) === optionId);
    if (!selectedItem) return;

    if (multiple) {
      setSelected((prev) => {
        const prevItems = prev || [];
        if (value) {
          // Add item if not already selected
          if (!prevItems.some((s) => keyExtractor(s) === optionId)) {
            return [...prevItems, selectedItem];
          }
          return prevItems;
        } else {
          // Remove item
          return prevItems.filter((s) => keyExtractor(s) !== optionId);
        }
      });
    } else {
      setSelected([selectedItem]);
      setOpen(false);
    }
  };

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        title: label,
        options: data.map((item) => {
          const key = keyExtractor(item);
          const isSelected =
            selected?.some((s) => keyExtractor(s) === key) || false;

          if (multiple) {
            return {
              type: "toggle" as const,
              label: titleExtractor(item) || key,
              value: isSelected,
              onToggle: () => handleOptionSelect(key, !isSelected),
            };
          }

          return {
            type: "radio" as const,
            label: titleExtractor(item) || key,
            value: key,
            selected: isSelected,
            onPress: () => handleOptionSelect(key),
          };
        }),
      },
    ],
    [
      data,
      selected,
      multiple,
      keyExtractor,
      titleExtractor,
      label,
      handleOptionSelect,
    ],
  );

  const getDisplayValue = () => {
    if (selected?.length !== undefined && selected.length > 0) {
      return selected.map(titleExtractor).join(",");
    }
    return placeholderText || "";
  };

  const trigger =
    typeof title === "string" ? (
      <View className='flex flex-col'>
        <Text className='opacity-50 mb-1 text-xs'>{title}</Text>
        <TouchableOpacity
          className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between'
          onPress={() => setOpen(true)}
          disabled={disabled}
        >
          <Text numberOfLines={1}>{getDisplayValue()}</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity onPress={() => setOpen(true)} disabled={disabled}>
        {title}
      </TouchableOpacity>
    );

  if (isTv) return null;

  return (
    <DisabledSetting disabled={disabled === true} showText={false} {...props}>
      <PlatformDropdown
        groups={optionGroups}
        trigger={trigger}
        title={label}
        open={open}
        onOpenChange={setOpen}
        onOptionSelect={handleOptionSelect}
        expoUIConfig={{
          hostStyle: { flex: 1 },
        }}
        bottomSheetConfig={{
          enableDynamicSizing: true,
          enablePanDownToClose: true,
        }}
      />
    </DisabledSetting>
  );
};

export default Dropdown;
