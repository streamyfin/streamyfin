import { Ionicons } from "@expo/vector-icons";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

interface ContentProps {
  channel: BaseItemDto;
  isFavorite: boolean;
  onConfirm: () => void;
}

const ChannelFavoriteSheetContent: React.FC<ContentProps> = ({
  channel,
  isFavorite,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { hideModal } = useGlobalModal();
  const insets = useSafeAreaInsets();

  const handleConfirm = () => {
    onConfirm();
    hideModal();
  };

  return (
    <BottomSheetView
      style={{
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
        paddingBottom: Math.max(24, insets.bottom),
        paddingTop: 8,
      }}
    >
      <View className='flex-row items-center mb-4 px-2'>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 8,
            overflow: "hidden",
            marginRight: 12,
            backgroundColor: "#1a1a1a",
          }}
        >
          <ItemImage
            style={{ width: "100%", height: "100%" }}
            contentFit='contain'
            item={channel}
          />
        </View>
        <Text
          className='text-white font-semibold text-base flex-1'
          numberOfLines={1}
        >
          {channel.Name}
        </Text>
      </View>

      <View className='rounded-xl overflow-hidden bg-neutral-800'>
        <TouchableOpacity
          onPress={handleConfirm}
          className='flex-row items-center px-4 py-3.5'
        >
          <Ionicons
            name={isFavorite ? "heart-dislike-outline" : "heart-outline"}
            size={22}
            color={isFavorite ? "#ef4444" : "white"}
          />
          <Text
            className={`ml-4 text-base ${isFavorite ? "text-red-500" : "text-white"}`}
          >
            {isFavorite
              ? t("live_tv.favorite_remove")
              : t("live_tv.favorite_add")}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheetView>
  );
};

export const useChannelFavoriteSheet = () => {
  const { showModal } = useGlobalModal();

  return useCallback(
    (channel: BaseItemDto, isFavorite: boolean, onConfirm: () => void) => {
      showModal(
        <ChannelFavoriteSheetContent
          channel={channel}
          isFavorite={isFavorite}
          onConfirm={onConfirm}
        />,
      );
    },
    [showModal],
  );
};
