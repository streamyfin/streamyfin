import { RoundButton } from "@/components/RoundButton";
import { useFavorite } from "@/hooks/useFavorite";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { View, type ViewProps } from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToFavorites: FC<Props> = ({ item, ...props }) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  return (
    <View {...props}>
      <RoundButton
        size='large'
        icon={isFavorite ? "heart" : "heart-outline"}
        fillColor={isFavorite ? "primary" : undefined}
        onPress={toggleFavorite}
      />
    </View>
  );
};
