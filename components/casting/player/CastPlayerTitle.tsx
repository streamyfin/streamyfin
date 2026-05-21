/**
 * Casting Player Title Area
 * Fixed title bar: item title and optional grey episode/season info.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { truncateTitle } from "@/utils/casting/helpers";

interface CastPlayerTitleProps {
  /** Top safe-area inset, used to offset the fixed title area. */
  insetTop: number;
  /** The currently playing item. */
  currentItem: BaseItemDto;
  /** Translation function. */
  t: TFunction;
}

export function CastPlayerTitle({
  insetTop,
  currentItem,
  t,
}: CastPlayerTitleProps) {
  return (
    <View
      style={{
        position: "absolute",
        top: insetTop + 50,
        left: 0,
        right: 0,
        zIndex: 95,
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        paddingVertical: 16,
        paddingHorizontal: 20,
      }}
    >
      {/* Title */}
      <Text
        style={{
          color: "white",
          fontSize: 20,
          fontWeight: "700",
          textAlign: "center",
          marginBottom: 6,
        }}
      >
        {truncateTitle(currentItem.Name || t("casting_player.unknown"), 50)}
      </Text>

      {/* Grey episode/season info */}
      {currentItem.Type === "Episode" &&
        currentItem.ParentIndexNumber !== undefined &&
        currentItem.IndexNumber !== undefined && (
          <Text
            style={{
              color: "#999",
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t("casting_player.season_episode_format", {
              season: currentItem.ParentIndexNumber,
              episode: currentItem.IndexNumber,
            })}
          </Text>
        )}
    </View>
  );
}
