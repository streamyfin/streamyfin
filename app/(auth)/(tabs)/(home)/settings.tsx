import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ListItem } from "@/components/ListItem";
import { SettingToggles } from "@/components/settings/SettingToggles";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { clearLogs, useLog } from "@/utils/log";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { useAtom } from "jotai";
import { Alert, ScrollView, View } from "react-native";
import * as Progress from "react-native-progress";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

export default function settings() {
  const { logout } = useJellyfin();
  const { logs } = useLog();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const insets = useSafeAreaInsets();

  const openQuickConnectAuthCodeInput = () => {
    Alert.prompt(
      "Quick connect",
      "Enter the quick connect code",
      async (text) => {
        if (text) {
          try {
            const res = await getQuickConnectApi(api!).authorizeQuickConnect({
              code: text,
              userId: user?.Id,
            });
            if (res.status === 200) {
              Alert.alert("Success", "Quick connect authorized");
            } else {
              Alert.alert("Error", "Invalid code");
            }
          } catch (e) {
            Alert.alert("Error", "Invalid code");
          }
        }
      }
    );
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
        <View>
          <Text className="font-bold text-lg mb-2">User Info</Text>

          <View className="flex flex-col rounded-xl overflow-hidden border-neutral-800 divide-y-2 divide-solid divide-neutral-800 ">
            <ListItem title="User" subTitle={user?.Name} />
            <ListItem title="Server" subTitle={api?.basePath} />
            <ListItem title="Token" subTitle={api?.accessToken} />
          </View>
          <Button className="my-2.5" color="black" onPress={logout}>
            Log out
          </Button>
        </View>

        <View>
          <Text className="font-bold text-lg mb-2">Quick connect</Text>
          <Button onPress={openQuickConnectAuthCodeInput} color="black">
            Authorize
          </Button>
        </View>

        <SettingToggles />

        <View>
          <Text className="font-bold text-lg mb-2">Logs</Text>
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
              <Text className="opacity-50">No logs available</Text>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
