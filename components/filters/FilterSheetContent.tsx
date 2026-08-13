import { Ionicons } from "@expo/vector-icons";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { isEqual } from "lodash";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";

interface Props<T> {
  title: string;
  data: T[];
  initialValues: T[];
  set: (value: T[]) => void;
  renderItemLabel: (item: T) => string;
  multiple?: boolean;
  onClose: () => void;
}

const SEARCH_THRESHOLD = 15;
const ROW_RADIUS = 20;

/**
 * Sheet content for FilterButton, rendered inside the GlobalModal bottom
 * sheet. The GlobalModal stores its content as a static snapshot, so this
 * component owns the selection state locally and mirrors changes back to the
 * caller through `set`.
 *
 * Uses a virtualized BottomSheetFlatList — filter lists (genres, tags, years)
 * can contain thousands of entries.
 *
 * The sheet sizes itself to this content, and it measures the scrollable's
 * content rather than the view tree: a title sitting next to the list is not
 * counted, and the sheet then opens too short and clips its last rows. So the
 * title, the count and the search box are the list's header instead.
 */
export const FilterSheetContent = <T,>({
  title,
  data,
  initialValues,
  set,
  renderItemLabel,
  multiple = false,
  onClose,
}: Props<T>) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [values, setValues] = useState<T[]>(initialValues);
  const [search, setSearch] = useState("");

  const showSearch = data.length > SEARCH_THRESHOLD;

  const filteredData = useMemo(() => {
    if (!search || !showSearch) return data;
    const query = search.toLowerCase();
    return data.filter((item) =>
      renderItemLabel(item).toLowerCase().includes(query),
    );
  }, [data, search, showSearch, renderItemLabel]);

  const select = (item: T) => {
    const selected = values.some((v) => isEqual(v, item));
    if (multiple) {
      const next = selected
        ? values.filter((v) => !isEqual(v, item))
        : values.concat(item);
      setValues(next);
      set(next);
    } else {
      if (!selected) {
        setValues([item]);
        set([item]);
      }
      setTimeout(() => onClose(), 250);
    }
  };

  return (
    <BottomSheetFlatList
      data={filteredData}
      keyExtractor={(item, index) => `${renderItemLabel(item)}-${index}`}
      keyboardShouldPersistTaps='handled'
      initialNumToRender={20}
      style={{
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
      }}
      contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
      ListHeaderComponent={
        <>
          <Text className='font-bold text-2xl mt-2'>{title}</Text>
          <Text className='mb-2 text-neutral-500'>
            {t("search.x_items", { count: data.length })}
          </Text>
          {showSearch && (
            <Input
              placeholder={t("search.search")}
              className='my-2 border-neutral-800 border'
              value={search}
              onChangeText={setSearch}
              returnKeyType='done'
            />
          )}
        </>
      }
      ItemSeparatorComponent={() => (
        <View
          style={{ height: StyleSheet.hairlineWidth }}
          className='bg-neutral-700'
        />
      )}
      renderItem={({ item, index }) => {
        const selected = values.some((v) => isEqual(v, item));
        // The rounded block used to come from a wrapper around the list; the
        // list now carries its own header, so the ends round themselves.
        const isFirst = index === 0;
        const isLast = index === filteredData.length - 1;
        return (
          <TouchableOpacity
            onPress={() => select(item)}
            style={{
              borderTopLeftRadius: isFirst ? ROW_RADIUS : 0,
              borderTopRightRadius: isFirst ? ROW_RADIUS : 0,
              borderBottomLeftRadius: isLast ? ROW_RADIUS : 0,
              borderBottomRightRadius: isLast ? ROW_RADIUS : 0,
            }}
            className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
          >
            <Text className='flex shrink'>{renderItemLabel(item)}</Text>
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={24}
              color='white'
            />
          </TouchableOpacity>
        );
      }}
    />
  );
};
