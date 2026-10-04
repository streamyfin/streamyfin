import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { View, type ViewProps } from "react-native";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { RoundButton } from "@/components/RoundButton";
import { Colors } from "@/constants/Colors";
import { useWatchlist } from "@/hooks/useWatchlist";

interface Props extends ViewProps {
  item: BaseItemDto;
  /** "large" is the header variant; the default sits in inline action rows. */
  size?: "default" | "large";
}

/**
 * KefinTweaks watchlist toggle, backed by Jellyfin's "Likes" rating.
 * Render only when settings.useKefinTweaks is enabled.
 */
export const AddToKefinWatchlist: FC<Props> = ({
  item,
  size = "large",
  ...props
}) => {
  const { isWatchlisted, toggleWatchlist, isPending } = useWatchlist(item);

  return (
    <View {...props}>
      <RoundButton size={size} onPress={toggleWatchlist} disabled={isPending}>
        <HeaderIcon
          name={isWatchlisted ? "watchlisted" : "watchlist"}
          tintColor={isWatchlisted ? Colors.primary : "white"}
          size={size === "large" ? undefined : 18}
        />
      </RoundButton>
    </View>
  );
};
