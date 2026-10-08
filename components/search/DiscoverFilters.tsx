import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { SeerrSearchSort } from "@/components/seerr/SeerrIndexPage";
import {
  DISCOVER_FILTER_WIDTH,
  SEARCH_TAB_ROW_HEIGHT,
} from "@/constants/Values";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, HStack, Image, Menu, Text } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : (require("@expo/ui/swift-ui") as typeof import("@expo/ui/swift-ui"));
const { accessibilityLabel, buttonStyle, font } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : (require("@expo/ui/swift-ui/modifiers") as typeof import("@expo/ui/swift-ui/modifiers"));

interface DiscoverFiltersProps {
  searchFilterId: string;
  orderFilterId: string;
  seerrOrderBy: SeerrSearchSort;
  setSeerrOrderBy: (value: SeerrSearchSort) => void;
  seerrSortOrder: "asc" | "desc";
  setSeerrSortOrder: (value: "asc" | "desc") => void;
  t: (key: string) => string;
}

const sortOptions = Object.keys(SeerrSearchSort).filter((v) =>
  Number.isNaN(Number(v)),
);

const orderOptions = ["asc", "desc"] as const;

export const DiscoverFilters: React.FC<DiscoverFiltersProps> = ({
  searchFilterId,
  orderFilterId,
  seerrOrderBy,
  setSeerrOrderBy,
  seerrSortOrder,
  setSeerrSortOrder,
  t,
}) => {
  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <Host
        style={{
          justifyContent: "center",
          alignItems: "center",
          overflow: "visible",
          height: SEARCH_TAB_ROW_HEIGHT,
          width: DISCOVER_FILTER_WIDTH,
          marginLeft: "auto",
        }}
      >
        <Menu
          label={
            <Button
              modifiers={[
                buttonStyle("glass"),
                accessibilityLabel(t("library.filters.sort_by")),
              ]}
            >
              {/* Built like the Library and Discover buttons, a body-sized
                  label: the zero-width text gives the icon a line of text's
                  height, so the three stay the same height at any text size. */}
              <HStack spacing={0}>
                <Image
                  systemName='line.3.horizontal.decrease.circle'
                  modifiers={[font({ textStyle: "body" })]}
                />
                <Text modifiers={[font({ textStyle: "body" })]}>
                  {"\u200B"}
                </Text>
              </HStack>
            </Button>
          }
        >
          <Menu
            label={`${t("library.filters.sort_by")}: ${t(
              `home.settings.plugins.seerr.order_by.${seerrOrderBy}`,
            )}`}
          >
            {sortOptions.map((item) => {
              const isSelected =
                seerrOrderBy === (item as unknown as SeerrSearchSort);
              return (
                <Button
                  key={item}
                  label={t(`home.settings.plugins.seerr.order_by.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() =>
                    setSeerrOrderBy(item as unknown as SeerrSearchSort)
                  }
                />
              );
            })}
          </Menu>
          <Menu
            label={`${t("library.filters.sort_order")}: ${t(
              `library.filters.${seerrSortOrder}`,
            )}`}
          >
            {orderOptions.map((item) => {
              const isSelected = seerrSortOrder === item;
              return (
                <Button
                  key={item}
                  label={t(`library.filters.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() => setSeerrSortOrder(item)}
                />
              );
            })}
          </Menu>
        </Menu>
      </Host>
    );
  }

  // Android UI
  return (
    <View className='flex flex-row justify-end items-center space-x-1'>
      <FilterButton
        id={searchFilterId}
        queryKey='seerr_search'
        queryFn={async () =>
          Object.keys(SeerrSearchSort).filter((v) => Number.isNaN(Number(v)))
        }
        set={(value) => setSeerrOrderBy(value[0])}
        values={[seerrOrderBy]}
        title={t("library.filters.sort_by")}
        renderItemLabel={(item) =>
          t(`home.settings.plugins.seerr.order_by.${item}`)
        }
      />
      <FilterButton
        id={orderFilterId}
        queryKey='seerr_search'
        queryFn={async () => ["asc", "desc"]}
        set={(value) => setSeerrSortOrder(value[0])}
        values={[seerrSortOrder]}
        title={t("library.filters.sort_order")}
        renderItemLabel={(item) => t(`library.filters.${item}`)}
      />
    </View>
  );
};
