import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { useFavorite } from "@/hooks/useFavorite";
import { scaleSize } from "@/utils/scaleSize";
import { TVButton } from "./TVButton";

export interface TVFavoriteButtonProps {
  item: BaseItemDto;
  disabled?: boolean;
}

export const TVFavoriteButton: React.FC<TVFavoriteButtonProps> = ({
  item,
  disabled,
}) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  return (
    <TVButton
      onPress={toggleFavorite}
      variant='glass'
      square
      disabled={disabled}
    >
      <Ionicons
        name={isFavorite ? "heart" : "heart-outline"}
        size={scaleSize(28)}
        color='#FFFFFF'
      />
    </TVButton>
  );
};
