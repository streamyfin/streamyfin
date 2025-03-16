import { Text } from "@/components/common/Text";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const MoviesTitleHeader: React.FC<Props> = ({ item, ...props }) => {
  return (
    <View {...props}>
      <Text uiTextView selectable className='font-bold text-2xl mb-1'>
        {item?.Name}
      </Text>
      <Text className='opacity-50'>{item?.ProductionYear}</Text>
    </View>
  );
};
