import { Button, ContextMenu, Host, Picker } from "@expo/ui/swift-ui";
import { Platform, View } from "react-native";
import { FilterButton } from "@/components/filters/FilterButton";
import { SeerrSearchSort } from "@/components/seerr/SeerrIndexPage";

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
                t(`home.settings.plugins.seerr.order_by.${item}`),
              )}
              variant='menu'
              selectedIndex={sortOptions.indexOf(
                seerrOrderBy as unknown as string,
              )}
              onOptionSelected={(event: any) => {
                const index = event.nativeEvent.index;
                setSeerrOrderBy(
                  sortOptions[index] as unknown as SeerrSearchSort,
                );
              }}
            />
            <Picker
              label={t("library.filters.sort_order")}
              options={orderOptions.map((item) => t(`library.filters.${item}`))}
              variant='menu'
              selectedIndex={orderOptions.indexOf(seerrSortOrder)}
              onOptionSelected={(event: any) => {
                const index = event.nativeEvent.index;
                setSeerrSortOrder(orderOptions[index]);
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
        disableSearch={true}
      />
      <FilterButton
        id={orderFilterId}
        queryKey='jellysearr_search'
        queryFn={async () => ["asc", "desc"]}
        set={(value) => setSeerrSortOrder(value[0])}
        values={[seerrSortOrder]}
        title={t("library.filters.sort_order")}
        renderItemLabel={(item) => t(`library.filters.${item}`)}
        disableSearch={true}
      />
    </View>
  );
};
