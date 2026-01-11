import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

export type PlaylistSortOption = "SortName" | "DateCreated";

export type PlaylistSortOrder = "Ascending" | "Descending";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  sortBy: PlaylistSortOption;
  sortOrder: PlaylistSortOrder;
  onSortChange: (
    sortBy: PlaylistSortOption,
    sortOrder: PlaylistSortOrder,
  ) => void;
}

const SORT_OPTIONS: { key: PlaylistSortOption; label: string; icon: string }[] =
  [
    { key: "SortName", label: "music.sort.alphabetical", icon: "text-outline" },
    {
      key: "DateCreated",
      label: "music.sort.date_created",
      icon: "time-outline",
    },
  ];

export const PlaylistSortSheet: React.FC<Props> = ({
  open,
  setOpen,
  sortBy,
  sortOrder,
  onSortChange,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const snapPoints = useMemo(() => ["40%"], []);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

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

  const handleSortSelect = useCallback(
    (option: PlaylistSortOption) => {
      // If selecting same option, toggle order; otherwise use sensible default
      if (option === sortBy) {
        onSortChange(
          option,
          sortOrder === "Ascending" ? "Descending" : "Ascending",
        );
      } else {
        // Default order based on sort type
        const defaultOrder: PlaylistSortOrder =
          option === "SortName" ? "Ascending" : "Descending";
        onSortChange(option, defaultOrder);
      }
      setOpen(false);
    },
    [sortBy, sortOrder, onSortChange, setOpen],
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
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom,
        }}
      >
        <Text className='text-white text-lg font-semibold mb-4'>
          {t("music.sort.title")}
        </Text>
        <View className='flex-col rounded-xl overflow-hidden bg-neutral-800'>
          {SORT_OPTIONS.map((option, index) => {
            const isSelected = sortBy === option.key;
            return (
              <React.Fragment key={option.key}>
                {index > 0 && <View style={styles.separator} />}
                <TouchableOpacity
                  onPress={() => handleSortSelect(option.key)}
                  className='flex-row items-center px-4 py-3.5'
                >
                  <Ionicons
                    name={option.icon as any}
                    size={22}
                    color={isSelected ? "#9334E9" : "#fff"}
                  />
                  <Text
                    className={`ml-4 text-base flex-1 ${isSelected ? "text-purple-500 font-medium" : "text-white"}`}
                  >
                    {t(option.label)}
                  </Text>
                  {isSelected && (
                    <View className='flex-row items-center'>
                      <Ionicons
                        name={
                          sortOrder === "Ascending" ? "arrow-up" : "arrow-down"
                        }
                        size={18}
                        color='#9334E9'
                      />
                      <Ionicons
                        name='checkmark'
                        size={22}
                        color='#9334E9'
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
