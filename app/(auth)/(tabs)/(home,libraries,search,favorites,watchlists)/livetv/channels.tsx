import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export default function page() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const _insets = useSafeAreaInsets();

  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels"],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: 0,
        limit: 500,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
  });

  return (
    <View className='flex flex-1'>
      <FlashList
        data={channels?.Items}
        renderItem={({ item }) => (
          <View className='flex flex-row items-center px-4 mb-2'>
            <View className='w-22 mr-4 rounded-lg overflow-hidden'>
              <ItemImage
                style={{
                  aspectRatio: "1/1",
                  width: 60,
                  borderRadius: 8,
                }}
                item={item}
              />
            </View>
            <Text className='font-bold'>{item.Name}</Text>
          </View>
        )}
      />
    </View>
  );
}
