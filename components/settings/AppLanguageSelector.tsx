import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { APP_LANGUAGES } from "@/i18n";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

interface Props extends ViewProps {}

export const AppLanguageSelector: React.FC<Props> = () => {
  const isTv = Platform.isTV;
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const optionGroups = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("home.settings.languages.system"),
        value: "system",
        selected: !settings?.preferedLanguage,
        onPress: () => updateSettings({ preferedLanguage: undefined }),
      },
      ...APP_LANGUAGES.map((lang) => ({
        type: "radio" as const,
        label: lang.label,
        value: lang.value,
        selected: lang.value === settings?.preferedLanguage,
        onPress: () => updateSettings({ preferedLanguage: lang.value }),
      })),
    ];

    return [
      {
        options,
      },
    ];
  }, [settings?.preferedLanguage, t, updateSettings]);

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View>
      <ListGroup title={t("home.settings.languages.title")}>
        <ListItem title={t("home.settings.languages.app_language")}>
          <PlatformDropdown
            groups={optionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-2'>
                  {APP_LANGUAGES.find(
                    (l) => l.value === settings?.preferedLanguage,
                  )?.label || t("home.settings.languages.system")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.languages.title")}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
