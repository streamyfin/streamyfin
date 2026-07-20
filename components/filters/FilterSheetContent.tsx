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

/**
 * Sheet content for FilterButton, rendered inside the GlobalModal bottom
 * sheet. The GlobalModal stores its content as a static snapshot, so this
 * component owns the selection state locally and mirrors changes back to the
 * caller through `set`.
 *
 * Uses a virtualized BottomSheetFlatList — filter lists (genres, tags, years)
 * can contain thousands of entries.
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
    <View
      style={{
        flex: 1,
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
      }}
    >
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
      <View
        style={{
          flex: 1,
          borderRadius: 20,
          overflow: "hidden",
          marginBottom: Math.max(16, insets.bottom),
        }}
      >
        <BottomSheetFlatList
          data={filteredData}
          keyExtractor={(item, index) => `${renderItemLabel(item)}-${index}`}
          keyboardShouldPersistTaps='handled'
          initialNumToRender={20}
          ItemSeparatorComponent={() => (
            <View
              style={{ height: StyleSheet.hairlineWidth }}
              className='bg-neutral-700'
            />
          )}
          renderItem={({ item }) => {
            const selected = values.some((v) => isEqual(v, item));
            return (
              <TouchableOpacity
                onPress={() => select(item)}
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
      </View>
    </View>
  );
};
