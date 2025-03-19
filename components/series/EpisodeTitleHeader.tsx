import { Text } from "@/components/common/Text";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter } from "expo-router";
import { TouchableOpacity, View, type ViewProps } from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const EpisodeTitleHeader: React.FC<Props> = ({ item, ...props }) => {
  const router = useRouter();

  return (
    <View {...props}>
      <Text uiTextView className='font-bold text-2xl' selectable>
        {item?.Name}
      </Text>
      <View className='flex flex-row items-center mb-1'>
        <TouchableOpacity
          onPress={() => {
            router.push(
              // @ts-ignore
              `/(auth)/series/${item.SeriesId}?seasonIndex=${item?.ParentIndexNumber}`,
            );
          }}
        >
          <Text className='opacity-50'>{item?.SeasonName}</Text>
        </TouchableOpacity>

        <Text className='opacity-50 mx-2'>{"—"}</Text>
        <Text className='opacity-50'>{`Episode ${item.IndexNumber}`}</Text>
      </View>
      <Text className='opacity-50'>{item?.ProductionYear}</Text>
    </View>
  );
};
