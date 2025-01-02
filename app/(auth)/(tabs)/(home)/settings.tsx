import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ListItem } from "@/components/ListItem";
import { SettingToggles } from "@/components/settings/SettingToggles";
import {useDownload} from "@/providers/DownloadProvider";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { clearLogs, useLog } from "@/utils/log";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useAtom } from "jotai";
import { Alert, ScrollView, View } from "react-native";
import * as Progress from "react-native-progress";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { useTranslation } from "react-i18next";

export default function settings() {
  const { logout } = useJellyfin();
  const { deleteAllFiles, appSizeUsage } = useDownload();
  const { logs } = useLog();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  const { data: size, isLoading: appSizeLoading } = useQuery({
    queryKey: ["appSize", appSizeUsage],
    queryFn: async () => {
      const app = await appSizeUsage;

      const remaining = await FileSystem.getFreeDiskStorageAsync();
      const total = await FileSystem.getTotalDiskCapacityAsync();

      return { app, remaining, total, used: (total - remaining) / total };
    },
  });

  const openQuickConnectAuthCodeInput = () => {
    Alert.prompt(
      t("home.settings.quick_connect.quick_connect_title"),
      t("home.settings.quick_connect.enter_the_quick_connect_code"),
      async (text) => {
        if (text) {
          try {
            const res = await getQuickConnectApi(api!).authorizeQuickConnect({
              code: text,
              userId: user?.Id,
            });
            if (res.status === 200) {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              Alert.alert(t("home.settings.quick_connect.success"), t("home.settings.quick_connect.quick_connect_autorized"));
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
            }
          } catch (e) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert(t("home.settings.quick_connect.error"), t("home.settings.quick_connect.invalid_code"));
          }
        }
      }
    );
  };

  const onDeleteClicked = async () => {
    try {
      await deleteAllFiles();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  };

  const onClearLogsClicked = async () => {
    clearLogs();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 100,
      }}
    >
      <View className="p-4 flex flex-col gap-y-4">
        {/* <Button
          onPress={() => {
            registerBackgroundFetchAsync();
          }}
        >
          registerBackgroundFetchAsync
        </Button> */}
        <View>
          <Text className="font-bold text-lg mb-2">{t("home.settings.user_info.user_info_title")}</Text>

          <View className="flex flex-col rounded-xl overflow-hidden border-neutral-800 divide-y-2 divide-solid divide-neutral-800 ">
            <ListItem title={t("home.settings.user_info.user")} subTitle={user?.Name} />
            <ListItem title={t("home.settings.user_info.server")} subTitle={api?.basePath} />
            <ListItem title={t("home.settings.user_info.token")} subTitle={api?.accessToken} />
          </View>
          <Button className="my-2.5" color="black" onPress={logout}>
            {t("home.settings.user_info.log_out_button")}
          </Button>
        </View>

        <View>
          <Text className="font-bold text-lg mb-2">{t("home.settings.quick_connect.quick_connect_title")}</Text>
          <Button onPress={openQuickConnectAuthCodeInput} color="black">
            {t("home.settings.quick_connect.authorize_button")}
          </Button>
        </View>

        <SettingToggles />

        <View className="flex flex-col space-y-2">
          <Text className="font-bold text-lg mb-2">{t("home.settings.storage.storage_title")}</Text>
          <View className="mb-4 space-y-2">
            {size && <Text>{t("home.settings.storage.app_usage", {usedSpace: size.app.bytesToReadable()})}</Text>}
            <Progress.Bar
              className="bg-gray-100/10"
              indeterminate={appSizeLoading}
              color="#9333ea"
              width={null}
              height={10}
              borderRadius={6}
              borderWidth={0}
              progress={size?.used}
            />
            {size && (
              <Text>
                {t("home.settings.storage.available_total", {availableSpace: size.remaining?.bytesToReadable(), totalSpace: size.total?.bytesToReadable()})}
                {}
              </Text>
            )}
          </View>
          <Button color="red" onPress={onDeleteClicked}>
            {t("home.settings.storage.delete_all_downloaded_files")}
          </Button>
          <Button color="red" onPress={onClearLogsClicked}>
            {t("home.settings.storage.delete_all_logs")}
          </Button>
        </View>
        <View>
          <Text className="font-bold text-lg mb-2">{t("home.settings.logs.logs_title")}</Text>
          <View className="flex flex-col space-y-2">
            {logs?.map((log, index) => (
              <View key={index} className="bg-neutral-900 rounded-xl p-3">
                <Text
                  className={`
                  mb-1
              ${log.level === "INFO" && "text-blue-500"}
              ${log.level === "ERROR" && "text-red-500"}
                `}
                >
                  {log.level}
                </Text>
                <Text uiTextView selectable className="text-xs">
                  {log.message}
                </Text>
              </View>
            ))}
            {logs?.length === 0 && (
              <Text className="opacity-50">{t("home.settings.logs.no_logs_available")}</Text>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
