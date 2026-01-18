import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";

export interface TVCastCrewTextProps {
  director?: BaseItemPerson | null;
  cast?: BaseItemPerson[];
  /** Hide the cast section (e.g., when visual cast section is shown) */
  hideCast?: boolean;
}

export const TVCastCrewText: React.FC<TVCastCrewTextProps> = React.memo(
  ({ director, cast, hideCast = false }) => {
    const { t } = useTranslation();

    if (!director && (!cast || cast.length === 0)) {
      return null;
    }

    return (
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 16,
          }}
        >
          {t("item_card.cast_and_crew")}
        </Text>
        <View style={{ flexDirection: "row", gap: 40 }}>
          {director && (
            <View>
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t("item_card.director")}
              </Text>
              <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                {director.Name}
              </Text>
            </View>
          )}
          {!hideCast && cast && cast.length > 0 && (
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 4,
                }}
              >
                {t("item_card.cast")}
              </Text>
              <Text style={{ fontSize: 18, color: "#FFFFFF" }}>
                {cast.map((c) => c.Name).join(", ")}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  },
);
