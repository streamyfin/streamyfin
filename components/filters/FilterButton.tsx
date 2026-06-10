import { FontAwesome, Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { FilterSheet } from "./FilterSheet";

interface FilterButtonProps<T> extends ViewProps {
  id: string;
  disableSearch?: boolean;
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
  disableSearch = false,
  multiple = false,
  icon = "filter",
  ...props
}: FilterButtonProps<T>) => {
  const [open, setOpen] = useState(false);
  const sheetModalRef = useRef<BottomSheetModal | null>(null);

  const { data: filters, isLoading } = useQuery<T[]>({
    queryKey: ["filters", title, queryKey, id],
    queryFn,
    staleTime: 0,
    enabled: !!id && !!queryFn && !!queryKey,
  });

  return (
    <>
      {/* present() must be called here, inside the press handler: calling it
          from an effect after a state update silently no-ops on the new
          architecture and the sheet never appears. Opening immediately also
          replaces the old data-loaded gate that left the button silently
          dead while options were still loading (the sheet shows a loader). */}
      <TouchableOpacity
        onPress={() => {
          setOpen(true);
          sheetModalRef.current?.present();
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
        modalRef={sheetModalRef}
        loading={isLoading}
        data={filters}
        values={values}
        set={set}
        renderItemLabel={renderItemLabel}
        searchFilter={searchFilter}
        disableSearch={disableSearch}
        multiple={multiple}
      />
    </>
  );
};
