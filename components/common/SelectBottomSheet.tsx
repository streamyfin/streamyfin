import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, { useCallback, useImperativeHandle, useRef } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "./Text";

export interface SelectOption {
  id: string;
  label: string;
  value?: string | number;
  selected?: boolean;
  onSelect?: () => void;
}

export interface SelectOptionGroup {
  id: string;
  title: string;
  options: SelectOption[];
}

export interface SelectBottomSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface SelectBottomSheetProps {
  title?: string;
  subtitle?: string;
  groups: SelectOptionGroup[];
  triggerIcon?: keyof typeof Ionicons.glyphMap;
  triggerSize?: number;
  triggerColor?: string;
  customTrigger?: React.ReactNode;
}

const SelectBottomSheet = React.forwardRef<
  SelectBottomSheetRef,
  SelectBottomSheetProps
>(
  (
    {
      title,
      subtitle,
      groups,
      triggerIcon = "ellipsis-horizontal",
      triggerSize = 24,
      triggerColor = "white",
      customTrigger,
    },
    ref,
  ) => {
    const bottomSheetModalRef = useRef<BottomSheetModal>(null);

    const present = useCallback(() => {
      bottomSheetModalRef.current?.present();
    }, []);

    const dismiss = useCallback(() => {
      bottomSheetModalRef.current?.dismiss();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        present,
        dismiss,
      }),
      [present, dismiss],
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

    const handleOptionSelect = useCallback(
      (option: SelectOption) => {
        option.onSelect?.();
        dismiss();
      },
      [dismiss],
    );

    if (Platform.isTV) {
      // On TV, fall back to a different UI pattern or return null
      return null;
    }

    return (
      <>
        {customTrigger ? (
          <TouchableOpacity onPress={present}>{customTrigger}</TouchableOpacity>
        ) : (
          <TouchableOpacity
            className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
            onPress={present}
          >
            <Ionicons
              name={triggerIcon}
              size={triggerSize}
              color={triggerColor}
            />
          </TouchableOpacity>
        )}

        <BottomSheetModal
          ref={bottomSheetModalRef}
          enableDynamicSizing
          handleIndicatorStyle={{
            backgroundColor: "white",
          }}
          backgroundStyle={{
            backgroundColor: "#171717",
          }}
          backdropComponent={renderBackdrop}
        >
          <BottomSheetScrollView>
            <View className='px-4 pt-2 pb-8'>
              {title && (
                <View className='mb-6'>
                  <Text className='font-bold text-2xl text-neutral-100'>
                    {title}
                  </Text>
                  {subtitle && (
                    <Text className='text-neutral-400 mt-1'>{subtitle}</Text>
                  )}
                </View>
              )}

              <View className='space-y-6'>
                {groups.map((group) => (
                  <View key={group.id} className='space-y-3'>
                    <Text className='font-semibold text-lg text-neutral-200'>
                      {group.title}
                    </Text>
                    <View className='space-y-2'>
                      {group.options.map((option) => (
                        <TouchableOpacity
                          key={option.id}
                          className={`flex flex-row items-center justify-between p-3 rounded-lg border ${
                            option.selected
                              ? "border-purple-500 bg-purple-500/10"
                              : "border-neutral-700 bg-neutral-800/50"
                          }`}
                          onPress={() => handleOptionSelect(option)}
                        >
                          <Text
                            className={`font-medium ${
                              option.selected
                                ? "text-purple-400"
                                : "text-neutral-100"
                            }`}
                          >
                            {option.label}
                          </Text>
                          {option.selected && (
                            <Ionicons
                              name='checkmark'
                              size={20}
                              color='#a855f7'
                            />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </BottomSheetScrollView>
        </BottomSheetModal>
      </>
    );
  },
);

SelectBottomSheet.displayName = "SelectBottomSheet";

export default SelectBottomSheet;
