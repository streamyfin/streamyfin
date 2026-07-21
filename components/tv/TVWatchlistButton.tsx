import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { TVButton } from "./TVButton";

export interface TVWatchlistButtonProps {
  item: BaseItemDto;
  disabled?: boolean;
}

/**
 * KefinTweaks watchlist toggle (Likes-backed) for TV detail pages.
 * Render only when settings.useKefinTweaks is enabled.
 */
export const TVWatchlistButton: React.FC<TVWatchlistButtonProps> = ({
  item,
  disabled,
}) => {
  const { isWatchlisted, toggleWatchlist, isPending } = useWatchlist(item);

  return (
    <TVButton
      onPress={toggleWatchlist}
      variant='glass'
      square
      disabled={disabled || isPending}
    >
      <Ionicons
        name={isWatchlisted ? "bookmark" : "bookmark-outline"}
        size={28}
        color='#FFFFFF'
      />
    </TVButton>
  );
};
