import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors, SeerrStatusColors, SheetColors } from "@/constants/Colors";
import {
  SEERR_BLOCKED_OPACITY,
  SEERR_STATUS_TINT_ALPHA,
} from "@/constants/Seerr";
import {
  type SeasonBadge,
  type SeasonRow,
  seasonRowStatus,
} from "@/utils/seerr/seasons";
import { seerrStatusBadge } from "@/utils/seerr/statusBadge";
import { MediaStatus } from "@/utils/seerr/types";

// A season already asked for or in the library shows where it stands in its
// circle, with the season list's own icon, so the column of circles reads as
// the state of the whole series.
const STATUS_COLORS: Partial<Record<MediaStatus, string>> = {
  [MediaStatus.PENDING]: SeerrStatusColors.pending,
  [MediaStatus.PROCESSING]: SeerrStatusColors.requested,
  [MediaStatus.PARTIALLY_AVAILABLE]: SeerrStatusColors.available,
  [MediaStatus.AVAILABLE]: SeerrStatusColors.available,
};

const CIRCLE = 24;

interface Props {
  rows: SeasonRow[];
  /** The seasons switched on, among those that can still be requested. */
  selected: number[];
  /** False on a server that only takes whole series: nothing to choose. */
  choosable?: boolean;
  /** Whether the quota lets one more season be switched on. */
  roomForOneMore?: boolean;
  onToggle: (seasonNumber: number) => void;
}

/**
 * The seasons of a series to request, as Seerr's request table has them, laid
 * out as a list: one row per season with a circle to check and its episode
 * count, and, for a season already requested or in the library, its status in
 * the circle and in words.
 */
export const SeasonPicker: React.FC<Props> = ({
  rows,
  selected,
  choosable = true,
  roomForOneMore = true,
  onToggle,
}) => {
  const { t } = useTranslation();

  // Written out rather than built, so each key reads as used.
  const statusText: Record<SeasonBadge, string> = {
    not_requested: t("seerr.season_badge.not_requested"),
    pending: t("seerr.season_badge.pending"),
    requested: t("seerr.season_badge.requested"),
    partially_available: t("seerr.season_badge.partially_available"),
    available: t("seerr.season_badge.available"),
  };

  return (
    <View
      style={{
        backgroundColor: SheetColors.group,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {rows.map((row, index) => {
        const chosen = !row.locked && selected.includes(row.seasonNumber);
        // Greyed like on Seerr once the quota is spent, except to switch off
        // a season already chosen.
        const blocked = !row.locked && !chosen && !roomForOneMore;
        const interactive = choosable && !row.locked && !blocked;
        const status = seasonRowStatus(row);
        const locked = row.locked
          ? {
              icon: seerrStatusBadge(status, false)?.icon,
              color: STATUS_COLORS[status] ?? SheetColors.secondaryText,
            }
          : undefined;
        const name =
          row.seasonNumber === 0
            ? t("seerr.specials")
            : t("seerr.season_number", { season_number: row.seasonNumber });
        const episodes = t("seerr.number_episodes", {
          count: row.episodeCount,
          episode_number: row.episodeCount,
        });

        return (
          <View key={row.seasonNumber}>
            {index > 0 && (
              <View
                style={{
                  height: 1,
                  marginLeft: 14 + CIRCLE + 14,
                  backgroundColor: SheetColors.separator,
                }}
              />
            )}
            <Pressable
              disabled={!interactive}
              onPress={() => onToggle(row.seasonNumber)}
              accessibilityRole='checkbox'
              // The status too: a label replaces what the row says.
              accessibilityLabel={[
                name,
                episodes,
                row.locked && row.badge ? statusText[row.badge] : undefined,
              ]
                .filter(Boolean)
                .join(", ")}
              accessibilityState={{
                checked: row.locked || chosen,
                disabled: !interactive,
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                opacity: blocked ? SEERR_BLOCKED_OPACITY : 1,
              }}
            >
              <View
                style={{
                  width: CIRCLE,
                  height: CIRCLE,
                  borderRadius: CIRCLE / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  ...(locked
                    ? {
                        backgroundColor: `${locked.color}${SEERR_STATUS_TINT_ALPHA}`,
                      }
                    : chosen
                      ? { backgroundColor: Colors.primary }
                      : { borderWidth: 2, borderColor: SheetColors.idle }),
                }}
              >
                {locked ? (
                  locked.icon && (
                    <MaterialCommunityIcons
                      name={locked.icon}
                      size={15}
                      color={locked.color}
                    />
                  )
                ) : chosen ? (
                  <Ionicons name='checkmark' size={15} color='white' />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17 }} numberOfLines={1}>
                  {name}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    marginTop: 1,
                    color: SheetColors.secondaryText,
                  }}
                >
                  {episodes}
                </Text>
              </View>
              {locked && row.badge && (
                <Text style={{ fontSize: 13, color: locked.color }}>
                  {statusText[row.badge]}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};
