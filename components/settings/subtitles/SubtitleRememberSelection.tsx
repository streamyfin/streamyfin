import { useTranslation } from "react-i18next";
import { Switch } from "react-native-gesture-handler";
import { ListItem } from "../../list/ListItem";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  pluginSettings?: any;
}

export const SubtitleRememberSelection: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  return (
    <ListItem
      title={t("home.settings.subtitles.set_subtitle_track")}
      disabled={pluginSettings?.rememberSubtitleSelections?.locked}
    >
      <Switch
        value={settings.rememberSubtitleSelections}
        disabled={pluginSettings?.rememberSubtitleSelections?.locked}
        onValueChange={(value) =>
          updateSettings({ rememberSubtitleSelections: value })
        }
      />
    </ListItem>
  );
};
