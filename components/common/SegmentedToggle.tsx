import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Full-width segmented view switcher: the options split the available width
 * evenly as chunky segments inside a rounded track. Used to swap between two
 * (or more) views, e.g. Streamystats vs KefinTweaks watchlists.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: SegmentedToggleProps<T>) {
  return (
    <View className='flex-row w-full bg-neutral-800 rounded-xl p-1'>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.8}
            className={`flex-1 items-center justify-center rounded-lg py-4 ${
              selected ? "bg-purple-600" : ""
            }`}
          >
            <Text
              className={`text-base font-semibold ${
                selected ? "text-white" : "text-neutral-400"
              }`}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
