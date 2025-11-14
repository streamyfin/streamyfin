import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import type { StorageLocation } from "@/modules";
import { useSettings } from "@/utils/atoms/settings";
import { getAvailableStorageLocations } from "@/utils/storage";

interface StorageLocationPickerProps {
  onClose: () => void;
}

export const StorageLocationPicker = forwardRef<
  BottomSheetModal,
  StorageLocationPickerProps
>(({ onClose }, ref) => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | undefined>(
    settings.downloadStorageLocation || "internal",
  );

  const { data: locations, isLoading } = useQuery({
    queryKey: ["storageLocations"],
    queryFn: getAvailableStorageLocations,
    enabled: Platform.OS === "android",
  });

  const handleSelect = (location: StorageLocation) => {
    setSelectedId(location.id);
  };

  const handleConfirm = () => {
    updateSettings({ downloadStorageLocation: selectedId });
    toast.success(
      t("settings.storage.storage_location_updated", {
        defaultValue: "Storage location updated",
      }),
    );
    onClose();
  };

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

  if (Platform.OS !== "android") {
    return null;
  }

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
      enablePanDownToClose
      enableDismissOnClose
    >
      <BottomSheetScrollView
        style={{
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
        }}
      >
        <View className='px-4 pt-2'>
          <Text className='text-lg font-semibold mb-1'>
            {t("settings.storage.select_storage_location", {
              defaultValue: "Select Storage Location",
            })}
          </Text>
          <Text className='text-sm text-neutral-500 mb-4'>
            {t("settings.storage.existing_downloads_note", {
              defaultValue:
                "Existing downloads will remain in their current location",
            })}
          </Text>

          {isLoading ? (
            <View className='items-center justify-center py-8'>
              <ActivityIndicator size='large' />
              <Text className='mt-4 text-neutral-500'>
                {t("settings.storage.loading_storage", {
                  defaultValue: "Loading storage options...",
                })}
              </Text>
            </View>
          ) : !locations || locations.length === 0 ? (
            <View className='items-center justify-center py-8'>
              <Text className='text-neutral-500'>
                {t("settings.storage.no_storage_found", {
                  defaultValue: "No storage locations found",
                })}
              </Text>
            </View>
          ) : (
            <>
              {locations.map((location) => {
                const isSelected = selectedId === location.id;
                const freeSpaceGB = (location.freeSpace / 1024 ** 3).toFixed(2);
                const totalSpaceGB = (location.totalSpace / 1024 ** 3).toFixed(
                  2,
                );
                const usedPercent = (
                  ((location.totalSpace - location.freeSpace) /
                    location.totalSpace) *
                  100
                ).toFixed(0);

                return (
                  <TouchableOpacity
                    key={location.id}
                    onPress={() => handleSelect(location)}
                    className={`p-4 mb-2 rounded-lg ${
                      isSelected
                        ? "bg-purple-600/20 border border-purple-600"
                        : "bg-neutral-800"
                    }`}
                  >
                    <View className='flex-row items-center justify-between'>
                      <View className='flex-1'>
                        <View className='flex-row items-center'>
                          <Text className='text-base font-semibold'>
                            {location.label}
                          </Text>
                          {location.type === "external" && (
                            <View className='ml-2 px-2 py-0.5 bg-blue-600/30 rounded'>
                              <Text className='text-xs text-blue-400'>
                                {t("settings.storage.removable", {
                                  defaultValue: "Removable",
                                })}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className='text-sm text-neutral-500 mt-1'>
                          {t("settings.storage.space_info", {
                            defaultValue:
                              "{{free}} GB free of {{total}} GB ({{used}}% used)",
                            free: freeSpaceGB,
                            total: totalSpaceGB,
                            used: usedPercent,
                          })}
                        </Text>
                      </View>
                      {isSelected && (
                        <View className='w-6 h-6 rounded-full bg-purple-600 items-center justify-center ml-2'>
                          <Text className='text-white text-xs'>✓</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View className='flex-row gap-x-2 py-4'>
                <TouchableOpacity
                  onPress={onClose}
                  className='flex-1 py-3 rounded-lg bg-neutral-800 items-center'
                >
                  <Text className='text-white font-semibold'>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  className='flex-1 py-3 rounded-lg bg-purple-600 items-center'
                  disabled={!selectedId}
                >
                  <Text className='text-white font-semibold'>
                    {t("common.confirm", { defaultValue: "Confirm" })}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});
