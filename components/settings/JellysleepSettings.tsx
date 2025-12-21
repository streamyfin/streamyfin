import { useTranslation } from "react-i18next";
import { Linking, ScrollView, Switch, View } from "react-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { SleepTimerOptionsSettings } from "@/components/settings/SleepTimerOptionsSettings";
import { useSettings } from "@/utils/atoms/settings";

export const JellysleepSettings = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  if (!settings) return null;

  const handleToggleJellysleep = (enabled: boolean) => {
    updateSettings({ jellysleepEnabled: enabled });
  };

  const handleOpenGitHubRepo = () => {
    Linking.openURL("https://github.com/jon4hz/jellyfin-plugin-jellysleep");
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View className='flex flex-col gap-y-4'>
        <ListGroup title={t("home.settings.plugins.jellysleep.title")}>
          <ListItem title={t("home.settings.plugins.jellysleep.enable")}>
            <Switch
              value={settings.jellysleepEnabled}
              onValueChange={handleToggleJellysleep}
            />
          </ListItem>
        </ListGroup>

        {settings.jellysleepEnabled && (
          <View className='mt-4'>
            <SleepTimerOptionsSettings />
          </View>
        )}

        <Text className='text-xs text-neutral-500 mt-2'>
          {t("jellysleep.plugin_requirement")}{" "}
          <Text className='text-blue-500' onPress={handleOpenGitHubRepo}>
            {t("jellysleep.github_repo_link")}
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
};
