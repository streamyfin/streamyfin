import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { APP_LANGUAGES } from "@/i18n";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { type OptionGroup, PlatformOptionsMenu } from "../PlatformOptionsMenu";

interface Props extends ViewProps {}

export const AppLanguageSelector: React.FC<Props> = () => {
  const isTv = Platform.isTV;
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const optionGroups: OptionGroup[] = useMemo(() => {
    const options = [
      {
        id: "system",
        type: "radio" as const,
        groupId: "languages",
        label: t("home.settings.languages.system"),
        selected: !settings?.preferedLanguage,
      },
      ...APP_LANGUAGES.map((lang) => ({
        id: lang.value,
        type: "radio" as const,
        groupId: "languages",
        label: lang.label,
        selected: lang.value === settings?.preferedLanguage,
      })),
    ];

    return [
      {
        id: "languages",
        title: t("home.settings.languages.title"),
        options,
      },
    ];
  }, [settings?.preferedLanguage, t]);

  const handleOptionSelect = (optionId: string) => {
    if (optionId === "system") {
      updateSettings({ preferedLanguage: undefined });
    } else {
      updateSettings({ preferedLanguage: optionId });
    }
    setOpen(false);
  };

  const trigger = (
    <TouchableOpacity
      className='bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between'
      onPress={() => setOpen(true)}
    >
      <Text>
        {APP_LANGUAGES.find((l) => l.value === settings?.preferedLanguage)
          ?.label || t("home.settings.languages.system")}
      </Text>
    </TouchableOpacity>
  );

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View>
      <ListGroup title={t("home.settings.languages.title")}>
        <ListItem title={t("home.settings.languages.app_language")}>
          <PlatformOptionsMenu
            groups={optionGroups}
            trigger={trigger}
            title={t("home.settings.languages.title")}
            open={open}
            onOpenChange={setOpen}
            onOptionSelect={handleOptionSelect}
            expoUIConfig={{
              hostStyle: { flex: 1 },
            }}
            bottomSheetConfig={{
              enableDynamicSizing: true,
              enablePanDownToClose: true,
            }}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
