import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { Colors } from "@/constants/Colors";
import {
  TV_GUIDE_FOCUSED_MIN_CELL_WIDTH,
  TV_GUIDE_LIVE_BADGE_MIN_CELL_WIDTH,
  TV_GUIDE_TEXT_MIN_CELL_WIDTH,
} from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVGuideProgramCellProps {
  program: BaseItemDto;
  /** Position in the row; the cell is absolutely placed so it can raise itself. */
  left: number;
  width: number;
  isCurrentlyAiring: boolean;
  onPress: () => void;
  disabled?: boolean;
  refSetter?: (ref: View | null) => void;
  /** Room from the cell's start to the end of the row, for a focused cell to grow into. */
  roomToRowEnd: number;
}

export const TVGuideProgramCell: React.FC<TVGuideProgramCellProps> = ({
  program,
  left,
  width,
  isCurrentlyAiring,
  onPress,
  disabled = false,
  refSetter,
  roomToRowEnd,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur } = useTVFocusAnimation({
    scaleAmount: 1,
    duration: 120,
  });

  // A focused cell is drawn wider than its slot, over the programs after it,
  // so a short program can be read. Only the drawing grows: the focusable
  // frame keeps the slot, so moving focus still visits every program.
  const displayWidth = focused
    ? Math.min(Math.max(width, TV_GUIDE_FOCUSED_MIN_CELL_WIDTH), roomToRowEnd)
    : width;

  const formatTime = (date: string | null | undefined) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return (
    <View style={[styles.wrapper, { left, width }]}>
      <Pressable
        ref={refSetter}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        focusable={!disabled}
        style={{ width }}
      >
        <Animated.View
          style={[
            styles.container,
            {
              backgroundColor: focused
                ? "#FFFFFF"
                : isCurrentlyAiring
                  ? "rgba(255, 255, 255, 0.15)"
                  : "rgba(255, 255, 255, 0.08)",
              borderColor: focused ? "#FFFFFF" : "rgba(255, 255, 255, 0.1)",
            },
            focused && styles.focusedShadow,
            { width: displayWidth },
          ]}
        >
          {displayWidth >= TV_GUIDE_TEXT_MIN_CELL_WIDTH && (
            <>
              {/* Program name */}
              <Text
                numberOfLines={2}
                style={[
                  styles.programName,
                  {
                    fontSize: typography.callout,
                    color: focused ? "#000000" : "#FFFFFF",
                  },
                ]}
              >
                {program.Name}
              </Text>

              {/* LIVE badge and time range. The badge sits in the row rather than
            over the title, and only where there is room for it. */}
              <View style={styles.timeRow}>
                {isCurrentlyAiring &&
                  displayWidth >= TV_GUIDE_LIVE_BADGE_MIN_CELL_WIDTH && (
                    <View style={styles.liveBadge}>
                      <Text
                        style={[
                          styles.liveBadgeText,
                          { fontSize: typography.callout },
                        ]}
                      >
                        {t("player.live")}
                      </Text>
                    </View>
                  )}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.timeText,
                    {
                      fontSize: typography.callout,
                      color: focused
                        ? "rgba(0, 0, 0, 0.6)"
                        : "rgba(255, 255, 255, 0.5)",
                    },
                  ]}
                >
                  {formatTime(program.StartDate)} -{" "}
                  {formatTime(program.EndDate)}
                </Text>
              </View>
            </>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 4,
    bottom: 4,
  },
  container: {
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: "center",
    overflow: "hidden",
  },
  focusedShadow: {
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    backgroundColor: Colors.live,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  programName: {
    fontWeight: "600",
    marginBottom: 4,
  },
  timeText: {
    flexShrink: 1,
    fontWeight: "400",
  },
});
