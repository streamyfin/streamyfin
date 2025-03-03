import { Text } from "@/components/common/Text";
import { useHaptic } from "@/hooks/useHaptic";
import { useDownload } from "@/providers/DownloadProvider";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { View } from "react-native";
import { toast } from "sonner-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";
import {Colors} from "@/constants/Colors";

export const StorageSettings = () => {
  const { deleteAllFiles, appSizeUsage } = useDownload();
  const { t } = useTranslation();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  const { data: size, isLoading: appSizeLoading } = useQuery({
    queryKey: ["appSize", appSizeUsage],
    queryFn: async () => {
      const app = await appSizeUsage;

      const remaining = await FileSystem.getFreeDiskStorageAsync();
      const total = await FileSystem.getTotalDiskCapacityAsync();

      return { app, remaining, total, used: (total - remaining) / total };
    },
  });

  const onDeleteClicked = async () => {
    try {
      await deleteAllFiles();
      successHapticFeedback();
    } catch (e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  };

  const calculatePercentage = (value: number, total: number) => {
    return ((value / total) * 100).toFixed(2);
  };

  return (
    <View>
      <View className="flex flex-col gap-y-1">
        <View className="flex flex-row items-center justify-between">
          <Text className="">{t("home.settings.storage.storage_title")}</Text>
          {size && (
            <Text className="text-neutral-500">
              {t("home.settings.storage.size_used", {
                used: Number(size.total - size.remaining).bytesToReadable(),
                total: size.total?.bytesToReadable(),
              })}
            </Text>
          )}
        </View>
        <View className="h-3 w-full bg-gray-100/10 rounded-md overflow-hidden flex flex-row">
          {size && (
            <>
              <View
                style={{
                  width: `${(size.app / size.total) * 100}%`,
                  backgroundColor: Colors.primaryRGB,
                }}
              />
              <View
                style={{
                  width: `${
                    ((size.total - size.remaining - size.app) / size.total) *
                    100
                  }%`,
                  backgroundColor: Colors.primaryLightRGB,
                }}
              />
            </>
          )}
        </View>
        <View className="flex flex-row gap-x-2">
          {size && (
            <>
              <View className="flex flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-purple-600 mr-1"></View>
                <Text className="text-white text-xs">
                  {t("home.settings.storage.app_usage", {
                    usedSpace: calculatePercentage(size.app, size.total),
                  })}
                </Text>
              </View>
              <View className="flex flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-purple-400 mr-1"></View>
                <Text className="text-white text-xs">
                  {t("home.settings.storage.device_usage", {
                    availableSpace: calculatePercentage(
                      size.total - size.remaining - size.app,
                      size.total
                    ),
                  })}
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
      <ListGroup>
        <ListItem
          textColor="red"
          onPress={onDeleteClicked}
          title={t("home.settings.storage.delete_all_downloaded_files")}
        />
      </ListGroup>
    </View>
  );
};
