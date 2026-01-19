import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { useFavorite } from "@/hooks/useFavorite";
import { TVButton } from "./TVButton";

export interface TVFavoriteButtonProps {
  item: BaseItemDto;
}

export const TVFavoriteButton: React.FC<TVFavoriteButtonProps> = ({ item }) => {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  return (
    <TVButton onPress={toggleFavorite} variant='glass' square>
      <Ionicons
        name={isFavorite ? "heart" : "heart-outline"}
        size={28}
        color='#FFFFFF'
      />
    </TVButton>
  );
};
