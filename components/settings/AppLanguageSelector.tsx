import * as DropdownMenu from "zeego/dropdown-menu";
import { TouchableOpacity, View } from "react-native";
import { Text } from "../common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { t } from "i18next";
import { APP_LANGUAGES } from "@/i18n";

export const AppLanguageSelector = () => {
  const [settings, updateSettings] = useSettings();

  return (
    <View className="mb-4">
      <Text className="text-lg font-bold mb-2">
        {t("home.settings.languages.title")}
      </Text>
      <View
        className={`
        flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4 rounded-xl
      `}
      >
        <View className="flex flex-col shrink">
          <Text className="font-semibold">
            {t("home.settings.languages.app_language")}
          </Text>
          <Text className="text-xs opacity-50">
            {t("home.settings.languages.app_language_description")}
          </Text>
        </View>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <TouchableOpacity className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
              <Text>
                {APP_LANGUAGES.find(
                  (l) => l.value === settings?.preferedLanguage
                )?.label || t("home.settings.languages.system")}
              </Text>
            </TouchableOpacity>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            loop={true}
            side="bottom"
            align="start"
            alignOffset={0}
            avoidCollisions={true}
            collisionPadding={8}
            sideOffset={8}
          >
            <DropdownMenu.Label>
              {t("home.settings.languages.title")}
            </DropdownMenu.Label>
            <DropdownMenu.Item
              key={"unknown"}
              onSelect={() => {
                updateSettings({
                  preferedLanguage: undefined,
                });
              }}
            >
              <DropdownMenu.ItemTitle>
                {t("home.settings.languages.system")}
              </DropdownMenu.ItemTitle>
            </DropdownMenu.Item>
            {APP_LANGUAGES?.map((l) => (
              <DropdownMenu.Item
                key={l?.value ?? "unknown"}
                onSelect={() => {
                  updateSettings({
                    preferedLanguage: l.value,
                  });
                }}
              >
                <DropdownMenu.ItemTitle>{l.label}</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </View>
    </View>
  );
};
