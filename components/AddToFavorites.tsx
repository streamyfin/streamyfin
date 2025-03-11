import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useFavorite } from "@/hooks/useFavorite";
import { View } from "react-native";
import { RoundButton } from "@/components/RoundButton";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToFavorites = ({ item, ...props }) => {
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
