import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TVFocusGuideView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes, useTVDesignTokens } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { TVActorCard } from "./TVActorCard";

export interface TVCastSectionProps {
  cast: BaseItemPerson[];
  apiBasePath?: string;
  onActorPress: (personId: string) => void;
  /** Setter function for the first actor card ref (for focus guide) */
  firstActorRefSetter?: (ref: View | null) => void;
  /** Ref to focus guide destination for upward navigation */
  upwardFocusDestination?: View | null;
}

export const TVCastSection: React.FC<TVCastSectionProps> = React.memo(
  ({
    cast,
    apiBasePath,
    onActorPress,
    firstActorRefSetter,
    upwardFocusDestination,
  }) => {
    const typography = useScaledTVTypography();
    const sizes = useScaledTVSizes();
    const tv = useTVDesignTokens();
    const { t } = useTranslation();

    if (cast.length === 0) {
      return null;
    }

    return (
      <View style={{ marginBottom: tv.spacing["3xl"] }}>
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: tv.spacing.xl,
          }}
        >
          {t("item_card.cast")}
        </Text>
        {/* Focus guide to direct upward navigation from cast back to options */}
        {upwardFocusDestination && (
          <TVFocusGuideView
            destinations={[upwardFocusDestination]}
            style={{ height: 1, width: "100%" }}
          />
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -tv.page.horizontal, overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: tv.page.horizontal,
            paddingVertical: tv.spacing.md,
            gap: sizes.gaps.item,
          }}
        >
          {cast.map((person, index) => (
            <TVActorCard
              key={person.Id || index}
              ref={index === 0 ? firstActorRefSetter : undefined}
              person={person}
              apiBasePath={apiBasePath}
              onPress={() => {
                if (person.Id) {
                  onActorPress(person.Id);
                }
              }}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
);
