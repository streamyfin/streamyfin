import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TVFocusGuideView, View } from "react-native";
import { Text } from "@/components/common/Text";
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
    const { t } = useTranslation();

    if (cast.length === 0) {
      return null;
    }

    return (
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 20,
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
          style={{ marginHorizontal: -80, overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: 80,
            paddingVertical: 12,
            gap: 20,
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
