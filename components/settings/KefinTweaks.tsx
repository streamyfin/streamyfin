import { useTranslation } from "react-i18next";
import { Switch, Text, View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";

export const KefinTweaksSettings = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const isEnabled = settings?.useKefinTweaks ?? false;

  return (
    <View className=''>
      <View className='flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900'>
        <Text className='text-xs text-red-600 mb-2'>
          {t("home.settings.plugins.kefinTweaks.watchlist_enabler")}
        </Text>

        <View className='flex flex-row items-center justify-between mt-2'>
          <Text className='text-white'>
            {isEnabled ? t("Watchlist On") : t("Watchlist Off")}
          </Text>

          <Switch
            value={isEnabled}
            onValueChange={(value) => updateSettings({ useKefinTweaks: value })}
            trackColor={{ false: "#555", true: "purple" }}
            thumbColor={isEnabled ? "#fff" : "#ccc"}
          />
        </View>
      </View>
    </View>
  );
};
