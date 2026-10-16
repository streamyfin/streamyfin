import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type React from "react";
import type { View } from "react-native";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { scaleSize } from "@/utils/scaleSize";
import { TVButton } from "./TVButton";

export interface TVWatchlistButtonProps {
  item: BaseItemDto;
  disabled?: boolean;
  /** Lets a page aim a TVFocusGuideView at this button. */
  refSetter?: (ref: View | null) => void;
}

/**
 * KefinTweaks watchlist toggle (Likes-backed) for TV detail pages.
 * Render only when settings.useKefinTweaks is enabled.
 */
export const TVWatchlistButton: React.FC<TVWatchlistButtonProps> = ({
  item,
  disabled,
  refSetter,
}) => {
  const { isWatchlisted, toggleWatchlist } = useWatchlist(item);
  const isOffline = useOfflineMode();

  // The toggle writes Jellyfin's Likes rating, so offline it could only fail.
  if (isOffline) return null;

  return (
    <TVButton
      onPress={toggleWatchlist}
      variant='glass'
      square
      // Not disabled while the request runs: a disabled TVButton gives up the
      // focus, and the toggle already ignores presses until it settles.
      disabled={disabled}
      refSetter={refSetter}
    >
      <Ionicons
        name={isWatchlisted ? "bookmark" : "bookmark-outline"}
        size={scaleSize(28)}
        color='#FFFFFF'
      />
    </TVButton>
  );
};
