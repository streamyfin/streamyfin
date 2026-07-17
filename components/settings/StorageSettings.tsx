import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, View } from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { useHaptic } from "@/hooks/useHaptic";
import { useDownload } from "@/providers/DownloadProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getStorageLabel } from "@/utils/storage";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { StorageLocationPicker } from "./StorageLocationPicker";

export const StorageSettings = () => {
  const { deleteAllFiles, appSizeUsage } = useDownload();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const { data: size } = useQuery({
    queryKey: ["appSize"],
    queryFn: async () => {
      const app = await appSizeUsage();

      return {
        appSize: app.appSize,
        total: app.total,
        remaining: app.remaining,
        used: (app.total - app.remaining) / app.total,
      };
    },
    // Keep the bar moving while a download is writing to disk.
    refetchInterval: 10 * 1000,
  });

  const { data: storageLabel } = useQuery({
    queryKey: ["storageLabel", settings.downloadStorageLocation],
    queryFn: () => getStorageLabel(settings.downloadStorageLocation),
    enabled: Platform.OS === "android",
  });

  const onDeleteClicked = () => {
    Alert.alert(
      t("home.settings.storage.delete_all_downloaded_files_confirm"),
      t("home.settings.storage.delete_all_downloaded_files_confirm_desc"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("common.ok"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAllFiles();
              successHapticFeedback();
            } catch (_e) {
              errorHapticFeedback();
              toast.error(t("home.settings.toasts.error_deleting_files"));
            } finally {
              // Reflect the freed space immediately instead of waiting for
              // the next poll.
              queryClient.invalidateQueries({ queryKey: ["appSize"] });
            }
          },
        },
      ],
    );
  };

  const calculatePercentage = (value: number, total: number) => {
    return ((value / total) * 100).toFixed(2);
  };

  return (
    <View>
      <View className='flex flex-col gap-y-1'>
        <View className='flex flex-row items-center justify-between'>
          <Text className=''>{t("home.settings.storage.storage_title")}</Text>
          {size && (
            <Text className='text-neutral-500'>
              {t("home.settings.storage.size_used", {
                used: Number(size.total - size.remaining).bytesToReadable(),
                total: size.total?.bytesToReadable(),
              })}
            </Text>
          )}
        </View>
        <View className='h-3 w-full bg-gray-100/10 rounded-md overflow-hidden flex flex-row'>
          {size && (
            <View className='flex flex-row'>
              <View
                style={{
                  width: `${(size.appSize / size.total) * 100}%`,
                  backgroundColor: Colors.primaryRGB,
                }}
              />
              <View
                style={{
                  width: `${((size.total - size.remaining - size.appSize) / size.total) * 100}%`,
                  backgroundColor: Colors.primaryLightRGB,
                }}
              />
            </View>
          )}
        </View>
        <View className='flex flex-row gap-x-2'>
          {size && (
            <View className='flex flex-row gap-x-2'>
              <View className='flex flex-row items-center'>
                <View className='w-3 h-3 rounded-full bg-purple-600 mr-1' />
                <Text className='text-white text-xs'>
                  {t("home.settings.storage.app_usage", {
                    usedSpace: calculatePercentage(size.appSize, size.total),
                  })}
                </Text>
              </View>
              <View className='flex flex-row items-center'>
                <View className='w-3 h-3 rounded-full bg-purple-400 mr-1' />
                <Text className='text-white text-xs'>
                  {t("home.settings.storage.device_usage", {
                    availableSpace: calculatePercentage(
                      size.total - size.remaining - size.appSize,
                      size.total,
                    ),
                  })}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      {!Platform.isTV && (
        <>
          {Platform.OS === "android" && (
            <ListGroup>
              <ListItem
                title={t("settings.storage.download_location", {
                  defaultValue: "Download Location",
                })}
                value={storageLabel || "Internal Storage"}
                onPress={() => bottomSheetModalRef.current?.present()}
              />
            </ListGroup>
          )}
          <ListGroup>
            <ListItem
              textColor='red'
              onPress={onDeleteClicked}
              title={t("home.settings.storage.delete_all_downloaded_files")}
            />
          </ListGroup>
        </>
      )}

      <StorageLocationPicker
        ref={bottomSheetModalRef}
        onClose={() => bottomSheetModalRef.current?.dismiss()}
      />
    </View>
  );
};
