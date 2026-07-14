import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { scaleSize } from "@/utils/scaleSize";

const isAggregateType = (item: BaseItemDto) =>
  item.Type === "Series" || item.Type === "BoxSet";

// TV sizes are scaled relative to a 1920×1080 reference (see scaleSize).
const tvBadgeBase: ViewStyle = {
  position: "absolute",
  top: scaleSize(8),
  right: scaleSize(8),
  height: scaleSize(28),
  borderRadius: scaleSize(14),
  backgroundColor: "rgba(255,255,255,0.92)",
  alignItems: "center",
  justifyContent: "center",
};

// Mobile uses raw dp — no scaling.
const mobileBadgeBase: ViewStyle = {
  position: "absolute",
  top: 4,
  right: 4,
  height: 20,
  borderRadius: 10,
  backgroundColor: "#9333ea",
  alignItems: "center",
  justifyContent: "center",
};

/**
 * Renders the unplayed-episode count badge for Series/BoxSet items that still
 * have episodes left to watch. Returns null for non-aggregate types, fully
 * watched items, or items with no unplayed count, so it is safe to mount
 * unconditionally as an overlay (e.g. on top of the tvOS glass poster, where
 * the watched checkmark is drawn natively and only the count needs RN).
 */
export const UnplayedCountBadge: React.FC<{ item: BaseItemDto }> = React.memo(
  ({ item }) => {
    if (!isAggregateType(item)) return null;
    if (item.UserData?.Played) return null;
    const unplayed = item.UserData?.UnplayedItemCount ?? 0;
    if (unplayed <= 0) return null;
    // Cap at 1k+ to keep the badge compact (jellyfin-web caps at 99+).
    const label = unplayed >= 1000 ? "1k+" : String(unplayed);

    if (Platform.isTV) {
      return (
        <View
          style={[
            tvBadgeBase,
            { minWidth: scaleSize(28), paddingHorizontal: scaleSize(7) },
          ]}
        >
          <Text
            style={{
              fontSize: scaleSize(15),
              fontWeight: "700",
              color: "black",
            }}
          >
            {label}
          </Text>
        </View>
      );
    }

    return (
      <View style={[mobileBadgeBase, { minWidth: 20, paddingHorizontal: 5 }]}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>
          {label}
        </Text>
      </View>
    );
  },
);

export const WatchedIndicator: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  const isMovieOrEpisode = item.Type === "Movie" || item.Type === "Episode";
  const isAggregate = isAggregateType(item);
  const isPlayed = item.UserData?.Played === true;

  if (Platform.isTV) {
    // Fully watched → white checkmark badge (top-right)
    if (isPlayed && (isMovieOrEpisode || isAggregate)) {
      return (
        <View style={[tvBadgeBase, { width: scaleSize(28) }]}>
          <Ionicons name='checkmark' size={scaleSize(18)} color='black' />
        </View>
      );
    }
    // Series/BoxSet with remaining episodes → count badge
    return <UnplayedCountBadge item={item} />;
  }

  // Mobile: purple corner ribbon for unwatched Movie/Episode (existing behavior)
  return (
    <>
      {isMovieOrEpisode && !isPlayed && (
        <View className='bg-purple-600 w-8 h-8 absolute -top-4 -right-4 rotate-45' />
      )}

      {/* Fully watched Series/BoxSet → small purple checkmark */}
      {isAggregate && isPlayed && (
        <View style={[mobileBadgeBase, { width: 20 }]}>
          <Ionicons name='checkmark' size={13} color='white' />
        </View>
      )}

      {/* Series/BoxSet with remaining episodes → count badge */}
      <UnplayedCountBadge item={item} />
    </>
  );
};
