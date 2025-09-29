import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { RoundButton } from "@/components/RoundButton";
import { useFavorite } from "@/hooks/useFavorite";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToFavorites: FC<Props> = ({ item, ...props }) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  if (Platform.OS === "ios") {
    return (
      <View {...props}>
        <RoundButton
          size='large'
          icon={isFavorite ? "heart" : "heart-outline"}
          onPress={toggleFavorite}
        />
      </View>
    );
  }

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
