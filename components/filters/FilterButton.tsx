import { Text } from "@/components/common/Text";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { FilterSheet } from "./FilterSheet";

interface FilterButtonProps<T> extends ViewProps {
  id: string;
  showSearch?: boolean;
  queryKey: string;
  values: T[];
  title: string;
  set: (value: T[]) => void;
  queryFn: (params: any) => Promise<any>;
  searchFilter?: (item: T, query: string) => boolean;
  renderItemLabel: (item: T) => React.ReactNode;
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
  searchFilter,
  showSearch = true,
  multiple = false,
  icon = "filter",
  ...props
}: FilterButtonProps<T>) => {
  const [open, setOpen] = useState(false);

  const { data: filters } = useQuery<T[]>({
    queryKey: ["filters", title, queryKey, id],
    queryFn,
    staleTime: 0,
    enabled: !!id && !!queryFn && !!queryKey,
  });

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          filters?.length && setOpen(true);
        }}
      >
        <View
          className={`
            px-3 py-1.5 rounded-full flex flex-row items-center space-x-1
            ${
              values.length > 0
                ? "bg-purple-600  border border-purple-700"
                : "bg-neutral-900 border border-neutral-900"
            }
          ${filters?.length === 0 && "opacity-50"}
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
      <FilterSheet<T>
        title={title}
        open={open}
        setOpen={setOpen}
        data={filters}
        values={values}
        set={set}
        renderItemLabel={renderItemLabel}
        searchFilter={searchFilter}
        showSearch={showSearch}
        multiple={multiple}
      />
    </>
  );
};
