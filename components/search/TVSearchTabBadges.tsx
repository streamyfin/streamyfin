import React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TVFilterButton } from "@/components/tv/TVFilterButton";

type SearchType = "Library" | "Discover";

/** The search's sort, given once something is typed. */
export interface TVSearchSortButtons {
  /** The current sort's label. */
  sortValue: string;
  onSortPress: () => void;
  /** The current order's label, left out for a sort that has none. */
  orderValue?: string;
  onOrderPress: () => void;
}

export interface TVSearchTabBadgesProps {
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  showDiscover: boolean;
  sortButtons?: TVSearchSortButtons;
  disabled?: boolean;
}

/**
 * The Library and Discover tabs, when Seerr is set up, and the sort of the
 * results, as the TV library page has it: one button for the sort, one for
 * the order, each opening its sheet.
 */
export const TVSearchTabBadges: React.FC<TVSearchTabBadgesProps> = ({
  searchType,
  setSearchType,
  showDiscover,
  sortButtons,
  disabled = false,
}) => {
  const { t } = useTranslation();

  if (!showDiscover && !sortButtons) {
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
      {showDiscover && (
        <>
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
        </>
      )}
      {sortButtons && (
        <TVFilterButton
          label={t("library.filters.sort_by")}
          value={sortButtons.sortValue}
          onPress={sortButtons.onSortPress}
          disabled={disabled}
        />
      )}
      {sortButtons?.orderValue && (
        <TVFilterButton
          label={t("library.filters.sort_order")}
          value={sortButtons.orderValue}
          onPress={sortButtons.onOrderPress}
          disabled={disabled}
        />
      )}
    </View>
  );
};
