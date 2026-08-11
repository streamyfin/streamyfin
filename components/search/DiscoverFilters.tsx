import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { JellyseerrSearchSort } from "@/components/jellyseerr/JellyseerrIndexPage";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import crashes the route tree on tvOS at module load.
// Load it lazily and only off-TV; TV never renders this component.
const { Button, Host, Menu } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const { buttonStyle, menuOrder } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");

// UIMenu reorders items by proximity to the anchor, so a menu that opens
// upward shows them reversed. Keep the order they were provided in.
// Built once, and never on TV where the modifiers module is not loaded.
const fixedOrder = Platform.isTV ? [] : [menuOrder("fixed")];

interface DiscoverFiltersProps {
  searchFilterId: string;
  orderFilterId: string;
  jellyseerrOrderBy: JellyseerrSearchSort;
  setJellyseerrOrderBy: (value: JellyseerrSearchSort) => void;
  jellyseerrSortOrder: "asc" | "desc";
  setJellyseerrSortOrder: (value: "asc" | "desc") => void;
  t: (key: string) => string;
}

const sortOptions = Object.keys(JellyseerrSearchSort).filter((v) =>
  Number.isNaN(Number(v)),
);

const orderOptions = ["asc", "desc"] as const;

export const DiscoverFilters: React.FC<DiscoverFiltersProps> = ({
  searchFilterId,
  orderFilterId,
  jellyseerrOrderBy,
  setJellyseerrOrderBy,
  jellyseerrSortOrder,
  setJellyseerrSortOrder,
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
          modifiers={fixedOrder}
          label={
            <Button
              modifiers={[buttonStyle("glass")]}
              systemImage='line.3.horizontal.decrease.circle'
            />
          }
        >
          <Menu
            modifiers={fixedOrder}
            label={`${t("library.filters.sort_by")}: ${t(
              `home.settings.plugins.jellyseerr.order_by.${jellyseerrOrderBy}`,
            )}`}
          >
            {sortOptions.map((item) => {
              const isSelected =
                jellyseerrOrderBy === (item as unknown as JellyseerrSearchSort);
              return (
                <Button
                  key={item}
                  label={t(`home.settings.plugins.jellyseerr.order_by.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() =>
                    setJellyseerrOrderBy(
                      item as unknown as JellyseerrSearchSort,
                    )
                  }
                />
              );
            })}
          </Menu>
          <Menu
            modifiers={fixedOrder}
            label={`${t("library.filters.sort_order")}: ${t(
              `library.filters.${jellyseerrSortOrder}`,
            )}`}
          >
            {orderOptions.map((item) => {
              const isSelected = jellyseerrSortOrder === item;
              return (
                <Button
                  key={item}
                  label={t(`library.filters.${item}`)}
                  systemImage={isSelected ? "checkmark.circle.fill" : "circle"}
                  onPress={() => setJellyseerrSortOrder(item)}
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
        queryKey='jellyseerr_search'
        queryFn={async () =>
          Object.keys(JellyseerrSearchSort).filter((v) =>
            Number.isNaN(Number(v)),
          )
        }
        set={(value) => setJellyseerrOrderBy(value[0])}
        values={[jellyseerrOrderBy]}
        title={t("library.filters.sort_by")}
        renderItemLabel={(item) =>
          t(`home.settings.plugins.jellyseerr.order_by.${item}`)
        }
      />
      <FilterButton
        id={orderFilterId}
        queryKey='jellysearr_search'
        queryFn={async () => ["asc", "desc"]}
        set={(value) => setJellyseerrSortOrder(value[0])}
        values={[jellyseerrSortOrder]}
        title={t("library.filters.sort_order")}
        renderItemLabel={(item) => t(`library.filters.${item}`)}
      />
    </View>
  );
};
