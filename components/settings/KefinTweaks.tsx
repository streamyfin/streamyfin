import { useTranslation } from "react-i18next";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const KefinTweaksSettings = () => {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();

  const isEnabled = settings?.useKefinTweaks ?? false;
  const locked = pluginSettings?.useKefinTweaks?.locked === true;

  return (
    <ListGroup>
      <ListItem
        title={t("home.settings.plugins.kefinTweaks.watchlist_enabler")}
        disabledByAdmin={locked}
      >
        <SettingSwitch
          value={isEnabled}
          disabled={locked}
          onValueChange={(value) => updateSettings({ useKefinTweaks: value })}
        />
      </ListItem>
    </ListGroup>
  );
};
