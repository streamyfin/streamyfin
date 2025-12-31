import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { Button } from "../Button";
import { Text } from "../common/Text";

export const KefinTweaksSettings = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  return (
    <View className=''>
      <View>
        {
          <View className='flex flex-col rounded-xl overflow-hidden p-4 bg-neutral-900'>
            <Text className='text-xs text-red-600 mb-2'>
              {t("home.settings.plugins.kefinTweaks.watchlist_enabler")}
            </Text>
            <Button
              color='purple'
              className='h-12 mt-2'
              onPress={() => {
                updateSettings({ useKefinTweaks: !settings?.useKefinTweaks });
              }}
            >
              {t("home.settings.plugins.kefinTweaks.watchlist_button")}
            </Button>
          </View>
        }
      </View>
    </View>
  );
};
