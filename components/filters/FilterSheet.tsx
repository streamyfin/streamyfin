import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { isEqual } from "lodash";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Button } from "../Button";
import { Input } from "../common/Input";

interface Props<T> extends ViewProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  data?: T[] | null;
  values: T[];
  set: (value: T[]) => void;
  title: string;
  searchFilter?: (item: T, query: string) => boolean;
  renderItemLabel: (item: T) => React.ReactNode;
  disableSearch?: boolean;
  multiple?: boolean;
}

const LIMIT = 100;

/**
 * FilterSheet Component
 *
 * This component creates a bottom sheet modal for filtering and selecting items from a list.
 *
 * @template T - The type of items in the list
 *
 * @param {Object} props - The component props
 * @param {boolean} props.open - Whether the bottom sheet is open
 * @param {function} props.setOpen - Function to set the open state
 * @param {T[] | null} [props.data] - The full list of items to filter from
 * @param {T[]} props.values - The currently selected items
 * @param {function} props.set - Function to update the selected items
 * @param {string} props.title - The title of the bottom sheet
 * @param {function} props.searchFilter - Function to filter items based on search query
 * @param {function} props.renderItemLabel - Function to render the label for each item
 * @param {boolean} [props.disableSearch=false] - Whether to disable the search input
 *
 * @returns {React.ReactElement} The FilterSheet component
 *
 * Features:
 * - Displays a list of items in a bottom sheet
 * - Allows searching and filtering of items
 * - Supports single selection of items
 * - Loads items in batches for performance optimization
 * - Customizable item rendering
 */

export const FilterSheet = <T,>({
  values,
  data: _data,
  open,
  set,
  setOpen,
  title,
  searchFilter,
  renderItemLabel,
  disableSearch = false,
  multiple = false,
}: Props<T>) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["85%"], []);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<T[]>([]);
  const [offset, setOffset] = useState<number>(0);

  const [search, setSearch] = useState<string>("");

  const [showSearch, setShowSearch] = useState<boolean>(false);

  const filteredData = useMemo(() => {
    if (!search) return _data;
    const results = [];
    for (let i = 0; i < (_data?.length || 0); i++) {
      if (_data && searchFilter?.(_data[i], search)) {
        results.push(_data[i]);
      }
    }
    return results.slice(0, 100);
  }, [search, _data, searchFilter]);

  useEffect(() => {
    if (!data || data.length === 0 || disableSearch) return;
    if (data.length > 15) {
      setShowSearch(true);
    }
  }, [data]);

  // Loads data in batches of LIMIT size, starting from offset,
  // to implement efficient "load more" functionality
  useEffect(() => {
    if (!_data || _data.length === 0) return;
    const tmp = new Set(data);
    for (let i = offset; i < Math.min(_data.length, offset + LIMIT); i++) {
      tmp.add(_data[i]);
    }
    setData(Array.from(tmp));
  }, [offset, _data]);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback((index: number) => {
    if (index === -1) {
      setOpen(false);
    }
  }, []);

  const renderData = useMemo(() => {
    if (search.length > 0 && showSearch) return filteredData;
    return data;
  }, [search, filteredData, data]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
      style={{}}
    >
      <BottomSheetScrollView
        style={{
          flex: 1,
        }}
      >
        <View
          className='mt-2 mb-8'
          style={{
            paddingLeft: Math.max(16, insets.left),
            paddingRight: Math.max(16, insets.right),
          }}
        >
          <Text className='font-bold text-2xl'>{title}</Text>
          <Text className='mb-2 text-neutral-500'>
            {t("search.x_items", { count: _data?.length })}
          </Text>
          {showSearch && (
            <Input
              placeholder={t("search.search")}
              extraClassName='my-2 border-neutral-800 border'
              value={search}
              onChangeText={(text) => {
                setSearch(text);
              }}
              returnKeyType='done'
            />
          )}
          <View
            style={{
              borderRadius: 20,
              overflow: "hidden",
            }}
            className='mb-4 flex flex-col rounded-xl overflow-hidden'
          >
            {renderData?.map((item, index) => (
              <View key={index}>
                <TouchableOpacity
                  onPress={() => {
                    if (multiple) {
                      if (!values.includes(item)) set(values.concat(item));
                      else set(values.filter((v) => v !== item));

                      setTimeout(() => {
                        setOpen(false);
                      }, 250);
                    } else {
                      if (!values.includes(item)) {
                        set([item]);
                        setTimeout(() => {
                          setOpen(false);
                        }, 250);
                      }
                    }
                  }}
                  className=' bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
                >
                  <Text className='flex shrink'>{renderItemLabel(item)}</Text>
                  {values.some((i) => isEqual(i, item)) ? (
                    <Ionicons name='radio-button-on' size={24} color='white' />
                  ) : (
                    <Ionicons name='radio-button-off' size={24} color='white' />
                  )}
                </TouchableOpacity>
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                  }}
                  className='h-1 divide-neutral-700 '
                />
              </View>
            ))}
          </View>
          {data.length < (_data?.length || 0) && (
            <Button
              onPress={() => {
                setOffset(offset + 100);
              }}
            >
              Load more
            </Button>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};
