import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { LocalNetworkSettings } from "@/components/settings/LocalNetworkSettings";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { apiAtom } from "@/providers/JellyfinProvider";
import { storage } from "@/utils/mmkv";

export default function NetworkSettingsPage() {
  useDismissKeyboardOnLeave();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);

  const remoteUrl = storage.getString("serverUrl");

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom + 20,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <ListGroup title={t("home.settings.network.current_server")}>
          <ListItem
            title={t("home.settings.network.remote_url")}
            subtitle={remoteUrl ?? t("home.settings.network.not_configured")}
          />
          <ListItem
            title={t("home.settings.network.active_url")}
            subtitle={api?.basePath ?? t("home.settings.network.not_connected")}
          />
        </ListGroup>

        <View className='mt-4'>
          <LocalNetworkSettings />
        </View>
      </View>
    </ScrollView>
  );
}
