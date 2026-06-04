import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SettingsSwitchRow } from "@/components/settings/index/SettingsSwitchRow";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";

export const ChromecastSettings: React.FC = ({ ...props }) => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  return (
    <View {...props}>
      <ListGroup title={t("home.settings.chromecast.title")}>
        <SettingsSwitchRow
          title={t("home.settings.chromecast.enable_h265")}
          value={settings.enableH265ForChromecast}
          onValueChange={(enableH265ForChromecast) =>
            updateSettings({ enableH265ForChromecast })
          }
        />
      </ListGroup>
    </View>
  );
};
