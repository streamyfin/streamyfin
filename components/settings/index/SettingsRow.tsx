import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useHaptic } from "@/hooks/useHaptic";

export interface SettingsRowProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value?: string;
  showChevron?: boolean;
  onPress: () => void;
  isLast?: boolean;
}

const ACCENT = "#a855f7"; // single accent (full theming is a separate sub-project)

export const SettingsRow: React.FC<SettingsRowProps> = ({
  title,
  icon,
  value,
  showChevron = true,
  onPress,
  isLast = false,
}) => {
  const haptic = useHaptic("light"); // no-op when disableHapticFeedback is set

  return (
    <TouchableOpacity
      onPress={() => {
        haptic();
        onPress();
      }}
      className={`flex flex-row items-center bg-neutral-900 h-[48px] px-3 ${
        isLast ? "" : "border-b border-[#ffffff14]"
      }`}
    >
      <View
        className='h-[29px] w-[29px] rounded-[7px] items-center justify-center mr-3'
        style={{ backgroundColor: `${ACCENT}29` }}
      >
        <Ionicons name={icon} size={17} color='#c79bff' />
      </View>
      <Text className='flex-1 text-white text-[15px]' numberOfLines={1}>
        {title}
      </Text>
      {value ? (
        <Text className='text-[#9899A1] text-[15px] ml-2' numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showChevron ? (
        <Ionicons
          name='chevron-forward'
          size={17}
          color='#5A5960'
          style={{ marginLeft: 4 }}
        />
      ) : null}
    </TouchableOpacity>
  );
};
