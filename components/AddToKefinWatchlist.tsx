import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { RoundButton } from "@/components/RoundButton";
import { Colors } from "@/constants/Colors";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

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
  const { t } = useTranslation();
  const { isWatchlisted, toggleWatchlist, isPending } = useWatchlist(item);
  const isOffline = useOfflineMode();

  // The toggle writes Jellyfin's Likes rating, so offline it could only fail.
  if (isOffline) return null;

  return (
    <View {...props}>
      {/* Named after its source: with Streamystats on as well, the header
          shows a second bookmark next to this one. */}
      <RoundButton
        size={size}
        onPress={toggleWatchlist}
        disabled={isPending}
        accessibilityRole='button'
        accessibilityLabel={t(
          isWatchlisted
            ? "kefintweaksWatchlist.remove_button"
            : "kefintweaksWatchlist.add_button",
        )}
      >
        <HeaderIcon
          name={isWatchlisted ? "watchlisted" : "watchlist"}
          tintColor={isWatchlisted ? Colors.primary : "white"}
          size={size === "large" ? undefined : 18}
        />
      </RoundButton>
    </View>
  );
};
