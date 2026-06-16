import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { PluginSettings } from "@/components/settings/PluginSettings";
import { useSettings } from "@/utils/atoms/settings";

export default function PluginsPage() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { refreshStreamyfinPluginSettings } = useSettings();

  const handleRefreshFromServer = useCallback(async () => {
    await refreshStreamyfinPluginSettings();
    toast.success(t("home.settings.plugins.streamystats.toasts.refreshed"));
  }, [refreshStreamyfinPluginSettings, t]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        className='px-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <PluginSettings />

        {/* Pulls the centralised Streamyfin plugin settings for every plugin,
            so it lives on the plugins index rather than inside Streamystats. */}
        <TouchableOpacity
          onPress={handleRefreshFromServer}
          className='py-3 rounded-xl bg-neutral-800'
        >
          <Text className='text-center text-blue-500'>
            {t("home.settings.plugins.streamystats.refresh_from_server")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
