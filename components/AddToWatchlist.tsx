import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { useCallback, useRef } from "react";
import { View, type ViewProps } from "react-native";
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
        icon={isInAnyWatchlist ? "list" : "list-outline"}
        onPress={handlePress}
      />
      <WatchlistSheet ref={sheetRef} />
    </View>
  );
};
