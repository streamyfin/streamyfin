import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AudioToggles } from "@/components/settings/AudioToggles";
import { DownloadSettings } from "@/components/settings/DownloadSettings";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MediaToggles } from "@/components/settings/MediaToggles";
import { OtherSettings } from "@/components/settings/OtherSettings";
import { PluginSettings } from "@/components/settings/PluginSettings";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { SubtitleToggles } from "@/components/settings/SubtitleToggles";
import { UserInfo } from "@/components/settings/UserInfo";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { clearLogs } from "@/utils/log";
import { useHaptic } from "@/hooks/useHaptic";
import { useNavigation, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { storage } from "@/utils/mmkv";

export default function settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout } = useJellyfin();
  const successHapticFeedback = useHaptic("success");

  const onClearLogsClicked = async () => {
    clearLogs();
    successHapticFeedback();
  };

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            logout();
          }}
        >
          <Text className="text-red-600">Log out</Text>
        </TouchableOpacity>
      ),
    });
  }, []);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className="p-4 flex flex-col gap-y-4">
        <UserInfo />
        <QuickConnect className="mb-4" />

        <MediaProvider>
          <MediaToggles className="mb-4" />
          <AudioToggles className="mb-4" />
          <SubtitleToggles className="mb-4" />
        </MediaProvider>

        <OtherSettings />
        <DownloadSettings />

        <PluginSettings />

        <ListGroup title={"Intro"}>
          <ListItem
            onPress={() => {
              router.push("/intro/page");
            }}
            title={"Show intro"}
          />
        </ListGroup>

        <View className="mb-4">
          <ListGroup title={"Logs"}>
            <ListItem
              onPress={() => router.push("/settings/logs/page")}
              showArrow
              title={"Logs"}
            />
            <ListItem
              textColor="red"
              onPress={onClearLogsClicked}
              title={"Delete All Logs"}
            />
          </ListGroup>
        </View>

        <StorageSettings />
      </View>
    </ScrollView>
  );
}
