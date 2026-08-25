import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { View, type ViewProps } from "react-native";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { RoundButton } from "@/components/RoundButton";
import { Colors } from "@/constants/Colors";
import { useFavorite } from "@/hooks/useFavorite";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToFavorites: FC<Props> = ({ item, ...props }) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  return (
    <View {...props}>
      <RoundButton size='large' onPress={toggleFavorite}>
        <HeaderIcon
          name={isFavorite ? "favorited" : "favorite"}
          tintColor={isFavorite ? Colors.primary : "white"}
        />
      </RoundButton>
    </View>
  );
};
