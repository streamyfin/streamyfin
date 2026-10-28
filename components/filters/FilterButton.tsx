import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { skipToken, useQuery } from "@tanstack/react-query";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { FilterSheetContent } from "./FilterSheetContent";

interface FilterButtonProps<T> extends ViewProps {
  id: string;
  queryKey: string;
  values: T[];
  title: string;
  set: (value: T[]) => void;
  renderItemLabel: (item: T) => string;
  multiple?: boolean;
  icon?: "filter" | "sort";
}

// One or the other: a chip given neither would render and never open.
type FilterSource<T> =
  | { queryFn: (params: any) => Promise<any>; options?: undefined }
  // Options the caller already holds. The query is skipped.
  | { options: T[]; queryFn?: undefined };

export const FilterButton = <T,>({
  id,
  queryFn,
  options,
  queryKey,
  set,
  values, // selected values
  title,
  renderItemLabel,
  multiple = false,
  icon = "filter",
  ...props
}: FilterButtonProps<T> & FilterSource<T>) => {
  const { showModal, hideModal } = useGlobalModal();

  const { data } = useQuery<T[]>({
    queryKey: ["filters", title, queryKey, id],
    // Not undefined: React Query logs a missing queryFn on every render, even
    // for a disabled query. The token also disables it.
    queryFn: queryFn ?? skipToken,
    staleTime: 0,
    enabled: !!id && !!queryFn && !!queryKey,
  });
  const filters = options ?? data;

  const openSheet = () => {
    if (!filters?.length) return;
    showModal(
      <FilterSheetContent<T>
        title={title}
        data={filters}
        initialValues={values}
        set={set}
        renderItemLabel={renderItemLabel}
        multiple={multiple}
        onClose={hideModal}
      />,
      // No snap points: the sheet grows with its options and stops at the
      // shared ceiling, so a two-entry sort order opens small.
    );
  };

  return (
    <TouchableOpacity onPress={openSheet}>
      <View
        className={`
          px-3 py-1.5 rounded-full flex flex-row items-center space-x-1
          ${
            values.length > 0
              ? "bg-purple-600  border border-purple-700"
              : "bg-neutral-900 border border-neutral-900"
          }
          ${filters?.length === 0 ? "opacity-50" : ""}
        `}
        {...props}
      >
        <Text
          className={`
            ${values.length > 0 ? "text-purple-100" : "text-neutral-100"}
            text-xs font-semibold`}
        >
          {title}
        </Text>
        {icon === "filter" ? (
          <Ionicons
            name='filter'
            size={14}
            color='white'
            style={{ opacity: 0.5 }}
          />
        ) : (
          <FontAwesome
            name='sort'
            size={14}
            color='white'
            style={{ opacity: 0.5 }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
};
