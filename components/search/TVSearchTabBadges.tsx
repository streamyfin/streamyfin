import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TVFilterButton } from "@/components/tv/TVFilterButton";

type SearchType = "Library" | "Discover";

export interface TVSearchTabBadgesProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  showDiscover: boolean;
  disabled?: boolean;
}

export const TVSearchTabBadges: React.FC<TVSearchTabBadgesProps> = ({
  searchType,
  setSearchType,
  showDiscover,
  disabled = false,
}) => {
  const { t } = useTranslation();

  if (!showDiscover) {
    return null;
  }

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        marginTop: 16,
        marginBottom: 24,
      }}
    >
      <TVFilterButton
        label=''
        value={t("search.library")}
        hasActiveFilter={searchType === "Library"}
        onPress={() => setSearchType("Library")}
        disabled={disabled}
      />
      <TVFilterButton
        label=''
        value={t("search.discover")}
        hasActiveFilter={searchType === "Discover"}
        onPress={() => setSearchType("Discover")}
        disabled={disabled}
      />
    </View>
  );
};
