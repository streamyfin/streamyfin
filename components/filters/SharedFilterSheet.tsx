import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { isEqual } from "lodash";
import type React from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Loader } from "../Loader";

/**
 * Config for the filter currently shown by the shared sheet. Generics are erased
 * at the FilterButton → provider boundary, so item-typed callbacks use `any`.
 */
export interface FilterConfig {
  /** Stable identity — changing it remounts the content with fresh state. */
  key: string;
  id: string;
  queryKey: string;
  queryFn: (params: any) => Promise<any>;
  title: string;
  values: any[];
  set: (value: any[]) => void;
  renderItemLabel: (item: any) => React.ReactNode;
  searchFilter?: (item: any, query: string) => boolean;
  disableSearch?: boolean;
  multiple?: boolean;
}

const LIMIT = 100;

interface SharedFilterSheetProps {
  modalRef: React.RefObject<BottomSheetModal | null>;
  open: boolean;
  setOpen: (open: boolean) => void;
  config: FilterConfig | null;
}

/**
 * The single shared filter sheet — one BottomSheetModal hosted by
 * FilterSheetProvider for a whole screen; FilterButtons only swap its `config`.
 * Because only one modal ever exists, rapid taps across buttons can never stack
 * two sheets, so no guard/timer is needed. The modal shell stays mounted with a
 * stable ref (present() can run synchronously from the tapping button); the
 * inner content is keyed by the active filter so its pagination/search reset
 * cleanly between filters.
 */
export const SharedFilterSheet: React.FC<SharedFilterSheetProps> = ({
  modalRef,
  open,
  setOpen,
  config,
}) => {
  const snapPoints = useMemo(() => ["85%"], []);
  const insets = useSafeAreaInsets();

  // Opening is imperative (the provider calls present()); this effect only
  // closes, and never dismisses a modal that was never presented.
  const wasPresentedRef = useRef(false);
  useEffect(() => {
    if (!open && wasPresentedRef.current) {
      modalRef.current?.dismiss();
    }
  }, [open, modalRef]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index >= 0) {
        wasPresentedRef.current = true;
      } else if (index === -1) {
        wasPresentedRef.current = false;
        setOpen(false);
      }
    },
    [setOpen],
  );

  const requestClose = useCallback(() => setOpen(false), [setOpen]);

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
      ref={modalRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: "white" }}
      backgroundStyle={{ backgroundColor: "#171717" }}
    >
      <BottomSheetScrollView style={{ flex: 1 }}>
        <View
          className='mt-2 mb-8'
          style={{
            paddingLeft: Math.max(16, insets.left),
            paddingRight: Math.max(16, insets.right),
          }}
        >
          {config && (
            <SharedFilterSheetContent
              key={config.key}
              config={config}
              onRequestClose={requestClose}
            />
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

interface SharedFilterSheetContentProps {
  config: FilterConfig;
  onRequestClose: () => void;
}

const SharedFilterSheetContent: React.FC<SharedFilterSheetContentProps> = ({
  config,
  onRequestClose,
}) => {
  const {
    id,
    queryKey,
    queryFn,
    title,
    values,
    set,
    renderItemLabel,
    searchFilter,
    disableSearch = false,
    multiple = false,
  } = config;
  const { t } = useTranslation();

  // The options query lives here (deduped with the FilterButton's own query via
  // the shared React Query key), so the list stays live after the sheet opens.
  const { data: _data, isLoading: loading } = useQuery<any[]>({
    queryKey: ["filters", title, queryKey, id],
    queryFn,
    staleTime: 0,
    enabled: !!id && !!queryFn && !!queryKey,
  });

  const [data, setData] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState("");
  // Filtering on every keystroke blocks the JS thread on large lists; defer the
  // value so the keystroke render stays cheap and the list update runs after.
  const deferredSearch = useDeferredValue(search);
  const [showSearch, setShowSearch] = useState(false);

  const filteredData = useMemo(() => {
    if (!deferredSearch) return _data;
    const results = [];
    for (let i = 0; i < (_data?.length || 0); i++) {
      if (_data && searchFilter?.(_data[i], deferredSearch)) {
        results.push(_data[i]);
      }
    }
    return results.slice(0, 100);
  }, [deferredSearch, _data, searchFilter]);

  useEffect(() => {
    if (!data || data.length === 0 || disableSearch) return;
    if (data.length > 15) {
      setShowSearch(true);
    }
  }, [data, disableSearch]);

  // Loads data in batches of LIMIT from offset (efficient "load more").
  useEffect(() => {
    if (!_data || _data.length === 0) return;

    const newData = [...data];
    for (let i = offset; i < Math.min(_data.length, offset + LIMIT); i++) {
      const item = _data[i];
      // Option objects are recreated across renders → dedupe by value.
      const exists = newData.some((existingItem) =>
        isEqual(existingItem, item),
      );
      if (!exists) {
        newData.push(item);
      }
    }
    setData(newData);
  }, [offset, _data]);

  const renderData = useMemo(() => {
    if (deferredSearch.length > 0 && showSearch) return filteredData;
    return data;
  }, [deferredSearch, showSearch, filteredData, data]);

  const renderedRows = useMemo(
    () =>
      renderData?.map((item, index) => (
        <View key={index}>
          <TouchableOpacity
            onPress={() => {
              const isSelected = values.some((value) => isEqual(value, item));
              if (multiple) {
                if (!isSelected) set(values.concat(item));
                else set(values.filter((value) => !isEqual(value, item)));
                setTimeout(() => onRequestClose(), 250);
              } else if (!isSelected) {
                set([item]);
                setTimeout(() => onRequestClose(), 250);
              }
            }}
            className='bg-neutral-800 px-4 py-3 flex flex-row items-center justify-between'
          >
            <Text className='flex shrink'>{renderItemLabel(item)}</Text>
            {values.some((i) => isEqual(i, item)) ? (
              <Ionicons name='radio-button-on' size={24} color='white' />
            ) : (
              <Ionicons name='radio-button-off' size={24} color='white' />
            )}
          </TouchableOpacity>
          <View
            style={{ height: StyleSheet.hairlineWidth }}
            className='h-1 divide-neutral-700'
          />
        </View>
      )),
    [renderData, values, multiple, set, renderItemLabel, onRequestClose],
  );

  return (
    <>
      <Text className='font-bold text-2xl'>{title}</Text>
      {loading ? (
        <View className='my-8 flex items-center justify-center'>
          <Loader />
        </View>
      ) : (
        <Text className='mb-2 text-neutral-500'>
          {t("search.x_items", { count: _data?.length })}
        </Text>
      )}
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
        style={{ borderRadius: 20, overflow: "hidden" }}
        className='mb-4 flex flex-col rounded-xl overflow-hidden'
      >
        {renderedRows}
      </View>
      {data.length < (_data?.length || 0) && (
        <Button onPress={() => setOffset(offset + LIMIT)}>Load more</Button>
      )}
    </>
  );
};
