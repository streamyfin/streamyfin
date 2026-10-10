import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TVFocusGuideView, View, type ViewStyle } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { getCreditLines } from "@/utils/jellyfin/people";
import { scaleSize } from "@/utils/scaleSize";
import { TVFilterButton } from "./TVFilterButton";

// The least of the row the cast names accept before wrapping under the
// credits lines.
const CAST_MIN_ROW_SHARE = "40%";

export interface TVCastCrewTextProps {
  /** Everyone credited on the item; the credits lines are picked from it. */
  people?: BaseItemPerson[] | null;
  /** Opens a person. Without it the names are plain text, as when offline. */
  onPersonPress?: (personId: string) => void;
  /** Keeps the remote off the names, as while a modal covers the page. */
  disabled?: boolean;
  style?: ViewStyle;
  cast?: BaseItemPerson[];
  /** Hide the cast section (e.g., when visual cast section is shown) */
  hideCast?: boolean;
}

export const TVCastCrewText: React.FC<TVCastCrewTextProps> = React.memo(
  ({
    people,
    onPersonPress,
    disabled = false,
    style,
    cast,
    hideCast = false,
  }) => {
    const typography = useScaledTVTypography();
    const { t } = useTranslation();
    const credits = useMemo(() => getCreditLines(people), [people]);
    const showCast = !hideCast && cast && cast.length > 0;
    const hasLinks =
      !!onPersonPress &&
      credits.some((line) => line.people.some((person) => person.id));

    if (credits.length === 0 && !showCast) {
      return null;
    }

    const labelStyle = {
      fontSize: typography.callout,
      color: "#6B7280",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: scaleSize(4),
    } as const;

    const linesStyle = {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: scaleSize(40),
      overflow: "visible",
    } as const;

    const lines = (
      <>
        {credits.map((line) => (
          <View key={line.kind}>
            <Text style={labelStyle}>
              {t(`item_card.credits.${line.kind}`, {
                count: line.people.length,
              })}
            </Text>
            {onPersonPress ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: scaleSize(12),
                  paddingVertical: scaleSize(6),
                }}
              >
                {line.people.map(({ id, name }) =>
                  id ? (
                    <TVFilterButton
                      key={id}
                      label=''
                      value={name}
                      onPress={() => onPersonPress(id)}
                      disabled={disabled}
                    />
                  ) : (
                    <Text
                      key={name}
                      style={{
                        fontSize: typography.callout,
                        color: "#FFFFFF",
                        paddingVertical: scaleSize(10),
                      }}
                    >
                      {name}
                    </Text>
                  ),
                )}
              </View>
            ) : (
              <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
                {line.people.map((person) => person.name).join(", ")}
              </Text>
            )}
          </View>
        ))}
        {showCast && (
          // A basis rather than flex: 1, which on a wrapping row would squeeze
          // the names into whatever sliver the credits lines leave over.
          <View
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: CAST_MIN_ROW_SHARE,
            }}
          >
            <Text style={labelStyle}>{t("item_card.cast")}</Text>
            <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
              {cast.map((c) => c.Name).join(", ")}
            </Text>
          </View>
        )}
      </>
    );

    return (
      <View style={[{ marginBottom: scaleSize(32) }, style]}>
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: scaleSize(16),
          }}
        >
          {t("item_card.cast_and_crew")}
        </Text>
        {/* The names sit at the left edge, under rows that scroll sideways:
            the guide spans the page so focus coming down from anywhere in
            such a row lands on the first name instead of finding nothing.
            Without a name to focus it would be a dead end for the remote. */}
        {hasLinks ? (
          <TVFocusGuideView autoFocus={!disabled} style={linesStyle}>
            {lines}
          </TVFocusGuideView>
        ) : (
          <View style={linesStyle}>{lines}</View>
        )}
      </View>
    );
  },
);
