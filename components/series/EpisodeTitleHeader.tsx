import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { episodeNumberLabel } from "@/utils/episodeLabel";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const EpisodeTitleHeader: React.FC<Props> = ({ item, ...props }) => {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View {...props}>
      <Text className='font-bold text-2xl' selectable>
        {item?.Name}
      </Text>
      <View className='flex flex-row items-center mb-1'>
        <TouchableOpacity
          onPress={() => {
            router.push(
              `/(auth)/series/${item.SeriesId}?seasonIndex=${item?.ParentIndexNumber}`,
            );
          }}
        >
          <Text className='opacity-50'>{item?.SeasonName}</Text>
        </TouchableOpacity>

        <Text className='opacity-50 mx-2'>{"—"}</Text>
        <Text className='opacity-50'>
          {episodeNumberLabel(t, item.IndexNumber)}
        </Text>
      </View>
      <Text className='opacity-50'>{item?.ProductionYear}</Text>
    </View>
  );
};
