import { Button, ContextMenu, Host, Picker } from "@expo/ui/swift-ui";
import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { JellyseerrSearchSort } from "@/components/jellyseerr/JellyseerrIndexPage";

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
  if (Platform.OS === "ios") {
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
        <ContextMenu>
          <ContextMenu.Trigger>
            <Button
              variant='glass'
              modifiers={[]}
              systemImage='line.3.horizontal.decrease.circle'
            ></Button>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            <Picker
              label={t("library.filters.sort_by")}
              options={sortOptions.map((item) =>
                t(`home.settings.plugins.jellyseerr.order_by.${item}`),
              )}
              variant='menu'
              selectedIndex={sortOptions.indexOf(
                jellyseerrOrderBy as unknown as string,
              )}
              onOptionSelected={(event: any) => {
                const index = event.nativeEvent.index;
                setJellyseerrOrderBy(
                  sortOptions[index] as unknown as JellyseerrSearchSort,
                );
              }}
            />
            <Picker
              label={t("library.filters.sort_order")}
              options={orderOptions.map((item) => t(`library.filters.${item}`))}
              variant='menu'
              selectedIndex={orderOptions.indexOf(jellyseerrSortOrder)}
              onOptionSelected={(event: any) => {
                const index = event.nativeEvent.index;
                setJellyseerrSortOrder(orderOptions[index]);
              }}
            />
          </ContextMenu.Items>
        </ContextMenu>
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
        disableSearch={true}
      />
      <FilterButton
        id={orderFilterId}
        queryKey='jellysearr_search'
        queryFn={async () => ["asc", "desc"]}
        set={(value) => setJellyseerrSortOrder(value[0])}
        values={[jellyseerrSortOrder]}
        title={t("library.filters.sort_order")}
        renderItemLabel={(item) => t(`library.filters.${item}`)}
        disableSearch={true}
      />
    </View>
  );
};
