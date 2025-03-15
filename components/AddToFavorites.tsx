
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useFavorite } from "@/hooks/useFavorite";
import {View, ViewProps} from "react-native";
import { RoundButton } from "@/components/RoundButton";
import {FC} from "react";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToFavorites:FC<Props> = ({ item, ...props }) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  return (
    <View {...props}>
      <RoundButton
        size="large"
        icon={isFavorite ? "heart" : "heart-outline"}
        fillColor={isFavorite ? "primary" : undefined}
        onPress={toggleFavorite}
      />
    </View>
  );
};
