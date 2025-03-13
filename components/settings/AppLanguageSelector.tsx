const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { Platform, TouchableOpacity, View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useTranslation } from "react-i18next";
import { APP_LANGUAGES } from "@/i18n";

interface Props extends ViewProps {}

export const AppLanguageSelector: React.FC<Props> = ({ ...props }) => {
  if (Platform.isTV) return null;
  const [settings, updateSettings] = useSettings();
  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <View>
      <ListGroup title={t("home.settings.languages.title")}>
        <ListItem title={t("home.settings.languages.app_language")}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
                <Text>
                  {APP_LANGUAGES.find(
                    (l) => l.value === settings?.preferedLanguage,
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
        </ListItem>
      </ListGroup>
    </View>
  );
};
