import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useFavorite } from "@/hooks/useFavorite";
import { RoundButton } from "./RoundButton";
import { View } from "react-native";

interface Props extends ViewProps {
  item: BaseItemDto;
  type: "item" | "series";
}

export const AddToFavorites = ({ item, type, ...props }) => {
  const { isFavorite, toggleFavorite, _ } = useFavorite(item);

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
