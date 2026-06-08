import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { View, type ViewProps } from "react-native";
import { RoundButton } from "@/components/RoundButton";
import { useWatchlist } from "@/hooks/useWatchlist";

interface Props extends ViewProps {
  item: BaseItemDto;
}

/**
 * KefinTweaks watchlist toggle, backed by Jellyfin's "Likes" rating.
 * Render only when settings.useKefinTweaks is enabled.
 */
export const AddToKefinWatchlist: FC<Props> = ({ item, ...props }) => {
  const { isWatchlisted, toggleWatchlist } = useWatchlist(item);

  return (
    <View {...props}>
      <RoundButton
        size='large'
        icon={isWatchlisted ? "bookmark" : "bookmark-outline"}
        color={isWatchlisted ? "purple" : "white"}
        onPress={toggleWatchlist}
      />
    </View>
  );
};
