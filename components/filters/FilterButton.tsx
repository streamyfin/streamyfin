import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewProps,
} from "react-native";
import { Text } from "@/components/common/Text";
import { SHEET_MAX_HEIGHT_RATIO } from "@/constants/Values";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { FilterSheetContent } from "./FilterSheetContent";

interface FilterButtonProps<T> extends ViewProps {
  id: string;
  queryKey: string;
  values: T[];
  title: string;
  set: (value: T[]) => void;
  queryFn: (params: any) => Promise<any>;
  renderItemLabel: (item: T) => string;
  multiple?: boolean;
  icon?: "filter" | "sort";
}

export const FilterButton = <T,>({
  id,
  queryFn,
  queryKey,
  set,
  values, // selected values
  title,
  renderItemLabel,
  multiple = false,
  icon = "filter",
  ...props
}: FilterButtonProps<T>) => {
  const { showModal, hideModal } = useGlobalModal();
  const { height: windowHeight } = useWindowDimensions();
  // The sheet grows with its options instead of always taking the same slice
  // of the screen: a two-entry sort order should not open a near full height
  // panel with an empty bottom half.
  const maxSheetHeight = windowHeight * SHEET_MAX_HEIGHT_RATIO;

  const { data: filters } = useQuery<T[]>({
    queryKey: ["filters", title, queryKey, id],
    queryFn,
    staleTime: 0,
    enabled: !!id && !!queryFn && !!queryKey,
  });

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
      { maxDynamicContentSize: maxSheetHeight },
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
