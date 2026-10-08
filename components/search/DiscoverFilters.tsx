import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { SeerrSearchSort } from "@/components/seerr/SeerrIndexPage";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, Image, Menu } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { accessibilityLabel, buttonStyle, frame } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

/**
 * The filter icon's frame, in points. A glass button pads a custom label by
 * seven points above and below, so 20 gives the 34 point pill that the Library
 * and Discover buttons get from their text; the icon-only label it replaces
 * came out a point shorter. The text buttons grow with a larger text size and
 * this frame does not.
 */
const FILTER_ICON_FRAME = 20;

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

/**
 * Whether the Search screen shows these filters. They sort Seerr's results, so
 * any Discover search gets them; what the library search found has no bearing,
 * and its results stay cached while the Discover tab is open.
 */
export const showDiscoverFilters = (
  searchType: "Library" | "Discover",
  query: string,
) => searchType === "Discover" && query.length > 0;

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
          height: 40,
          width: 50,
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
              <Image
                systemName='line.3.horizontal.decrease.circle'
                modifiers={[
                  frame({
                    width: FILTER_ICON_FRAME,
                    height: FILTER_ICON_FRAME,
                  }),
                ]}
              />
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
