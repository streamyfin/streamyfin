import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { RoundButton } from "@/components/RoundButton";
import {
  WatchlistSheet,
  type WatchlistSheetRef,
} from "@/components/watchlists/WatchlistSheet";
import {
  useItemInWatchlists,
  useStreamystatsEnabled,
} from "@/hooks/useWatchlists";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const AddToWatchlist: FC<Props> = ({ item, ...props }) => {
  const { t } = useTranslation();
  const streamystatsEnabled = useStreamystatsEnabled();
  const sheetRef = useRef<WatchlistSheetRef>(null);

  const { data: watchlistsContainingItem } = useItemInWatchlists(item.Id);
  const isInAnyWatchlist = (watchlistsContainingItem?.length ?? 0) > 0;

  const handlePress = useCallback(() => {
    sheetRef.current?.open(item);
  }, [item]);

  // Don't render if Streamystats is not enabled
  if (!streamystatsEnabled) return null;

  return (
    <View {...props}>
      <RoundButton
        size='large'
        onPress={handlePress}
        accessibilityRole='button'
        accessibilityLabel={t("watchlists.streamystats_button")}
      >
        <HeaderIcon name={isInAnyWatchlist ? "watchlisted" : "watchlist"} />
      </RoundButton>
      <WatchlistSheet ref={sheetRef} />
    </View>
  );
};
