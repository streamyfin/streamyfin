import { useTranslation } from "react-i18next";
import { Linking, View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { SleepTimerOptionsSettings } from "@/components/settings/SleepTimerOptionsSettings";
import { useSettings } from "@/utils/atoms/settings";

const PLUGIN_URL = "https://github.com/jon4hz/jellyfin-plugin-jellysleep";

export const JellysleepSettings = () => {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const locked = pluginSettings?.jellysleepEnabled?.locked === true;

  if (!settings) return null;

  return (
    <View className='flex flex-col gap-y-4'>
      <ListGroup title={t("jellysleep.title")}>
        <ListItem title={t("jellysleep.enable")} disabledByAdmin={locked}>
          <SettingSwitch
            value={settings.jellysleepEnabled}
            disabled={locked}
            onValueChange={(jellysleepEnabled) =>
              updateSettings({ jellysleepEnabled })
            }
          />
        </ListItem>
      </ListGroup>

      {settings.jellysleepEnabled && <SleepTimerOptionsSettings />}

      <Text className='text-xs text-neutral-500'>
        {t("jellysleep.plugin_requirement")}{" "}
        <Text
          className='text-blue-500'
          onPress={() => Linking.openURL(PLUGIN_URL)}
        >
          {PLUGIN_URL}
        </Text>
      </Text>
    </View>
  );
};
