import { useTranslation } from "react-i18next";
import { Switch } from "react-native-gesture-handler";
import { Stepper } from "../../inputs/Stepper";
import { ListItem } from "../../list/ListItem";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  pluginSettings?: any;
}

export const SubtitleBackgroundSettings: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <ListItem
        title={t("home.settings.subtitles.subtitle_background")}
        subtitle={t("home.settings.subtitles.subtitle_background_hint")}
        disabled={pluginSettings?.subtitleBackground?.locked}
      >
        <Switch
          value={settings.subtitleBackground}
          disabled={pluginSettings?.subtitleBackground?.locked}
          onValueChange={(value) =>
            updateSettings({ subtitleBackground: value })
          }
        />
      </ListItem>
      {settings.subtitleBackground && (
        <ListItem
          title={t("home.settings.subtitles.subtitle_background_opacity")}
          disabled={pluginSettings?.subtitleBackgroundOpacity?.locked}
        >
          <Stepper
            value={settings.subtitleBackgroundOpacity}
            disabled={pluginSettings?.subtitleBackgroundOpacity?.locked}
            step={10}
            min={10}
            max={100}
            appendValue='%'
            onUpdate={(value) =>
              updateSettings({ subtitleBackgroundOpacity: value })
            }
          />
        </ListItem>
      )}
      {/* {settings.subtitleBackground && (
        <ListItem
          title={t("home.settings.subtitles.subtitle_background_padding")}
          disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
        >
          <Stepper
            value={settings.subtitleBackgroundPadding}
            disabled={pluginSettings?.subtitleBackgroundPadding?.locked}
            step={1}
            min={0}
            max={50}
            onUpdate={(value) =>
              updateSettings({ subtitleBackgroundPadding: value })
            }
          />
        </ListItem>
      )} */}
    </>
  );
};
