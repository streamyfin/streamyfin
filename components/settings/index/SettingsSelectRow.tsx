import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { ListItem } from "@/components/list/ListItem";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";

interface Props {
  title: string;
  valueLabel?: string;
  groups: OptionGroup[];
  dropdownTitle?: string;
  disabled?: boolean;
}

export const SettingsSelectRow: React.FC<Props> = ({
  title,
  valueLabel,
  groups,
  dropdownTitle,
  disabled,
}) => (
  <ListItem title={title} disabled={disabled}>
    <PlatformDropdown
      groups={groups}
      title={dropdownTitle}
      trigger={
        <View className='flex flex-row items-center justify-between pl-3'>
          <Text className='mr-1 text-[#8E8D91]'>{valueLabel}</Text>
          <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
        </View>
      }
    />
  </ListItem>
);
