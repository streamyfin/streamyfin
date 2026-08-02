import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { JellyseerrSearchSort } from "@/components/jellyseerr/JellyseerrIndexPage";

// @expo/ui's SwiftUI native module (ExpoUI) exists only in non-TV iOS builds —
// not on tvOS, and not on web (the desktop client). A static top-level import
// crashes the route tree at module load. Load it lazily and only on iOS.
const USES_SWIFT_UI = Platform.OS === "ios" && !Platform.isTV;

const { Button, Host, Menu } = USES_SWIFT_UI
  ? require("@expo/ui/swift-ui")
  : ({} as typeof import("@expo/ui/swift-ui"));
const { buttonStyle } = USES_SWIFT_UI
  ? require("@expo/ui/swift-ui/modifiers")
  : ({} as typeof import("@expo/ui/swift-ui/modifiers"));

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
          label={
            <Button
              modifiers={[buttonStyle("glass")]}
              systemImage='line.3.horizontal.decrease.circle'
            />
          }
        >
          <Menu
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
