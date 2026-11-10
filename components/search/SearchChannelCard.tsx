import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { TouchableOpacity, View } from "react-native";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { useChannelPress } from "@/components/livetv/useChannelPress";

export const SearchChannelCard = ({ channel }: { channel: BaseItemDto }) => {
  const { onPress, onLongPress } = useChannelPress(channel);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole='button'
      accessibilityLabel={channel.Name ?? undefined}
      className='flex flex-col w-24 mr-2'
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
      >
        <ItemImage
          style={{ width: "100%", height: "100%" }}
          contentFit='contain'
          item={channel}
        />
      </View>
      <Text numberOfLines={2} className='mt-2 text-xs'>
        {channel.Name}
      </Text>
    </TouchableOpacity>
  );
};
