import { Button, ContextMenu, Host } from "@expo/ui/swift-ui";
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
            <ContextMenu>
              <ContextMenu.Trigger>
                <Button>
                  {`${t("library.filters.sort_by")}: ${t(
                    `home.settings.plugins.jellyseerr.order_by.${jellyseerrOrderBy}`,
                  )}`}
                </Button>
              </ContextMenu.Trigger>
              <ContextMenu.Items>
                {sortOptions.map((item) => {
                  const label = t(
                    `home.settings.plugins.jellyseerr.order_by.${item}`,
                  );
                  const isSelected =
                    jellyseerrOrderBy ===
                    (item as unknown as JellyseerrSearchSort);
                  return (
                    <Button
                      key={item}
                      systemImage={
                        isSelected ? "checkmark.circle.fill" : "circle"
                      }
                      onPress={() =>
                        setJellyseerrOrderBy(
                          item as unknown as JellyseerrSearchSort,
                        )
                      }
                    >
                      {label}
                    </Button>
                  );
                })}
              </ContextMenu.Items>
            </ContextMenu>
            <ContextMenu>
              <ContextMenu.Trigger>
                <Button>
                  {`${t("library.filters.sort_order")}: ${t(
                    `library.filters.${jellyseerrSortOrder}`,
                  )}`}
                </Button>
              </ContextMenu.Trigger>
              <ContextMenu.Items>
                {orderOptions.map((item) => {
                  const label = t(`library.filters.${item}`);
                  const isSelected = jellyseerrSortOrder === item;
                  return (
                    <Button
                      key={item}
                      systemImage={
                        isSelected ? "checkmark.circle.fill" : "circle"
                      }
                      onPress={() => setJellyseerrSortOrder(item)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </ContextMenu.Items>
            </ContextMenu>
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
