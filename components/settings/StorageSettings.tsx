import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import { clearLogs } from "@/utils/log";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { View } from "react-native";
import * as Progress from "react-native-progress";
import { toast } from "sonner-native";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const StorageSettings = () => {
  const { deleteAllFiles, appSizeUsage } = useDownload();

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error("Error deleting files");
    }
  };

  const calculatePercentage = (value: number, total: number) => {
    return ((value / total) * 100).toFixed(2);
  };

  return (
    <View>
      <View className="flex flex-col gap-y-1">
        <View className="flex flex-row items-center justify-between">
          <Text className="">Storage</Text>
          {size && (
            <Text className="text-neutral-500">
              {Number(size.total - size.remaining).bytesToReadable()} of{" "}
              {size.total?.bytesToReadable()} used
            </Text>
          )}
        </View>
        <View className="h-3 w-full bg-gray-100/10 rounded-md overflow-hidden flex flex-row">
          {size && (
            <>
              <View
                style={{
                  width: `${(size.app / size.total) * 100}%`,
                  backgroundColor: "rgb(147 51 234)",
                }}
              />
              <View
                style={{
                  width: `${
                    ((size.total - size.remaining - size.app) / size.total) *
                    100
                  }%`,
                  backgroundColor: "rgb(192 132 252)",
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
                  App {calculatePercentage(size.app, size.total)}%
                </Text>
              </View>
              <View className="flex flex-row items-center">
                <View className="w-3 h-3 rounded-full bg-purple-400 mr-1"></View>
                <Text className="text-white text-xs">
                  Phone{" "}
                  {calculatePercentage(
                    size.total - size.remaining - size.app,
                    size.total
                  )}
                  %
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
          title="Delete All Downloaded Files"
        />
      </ListGroup>
    </View>
  );
};
