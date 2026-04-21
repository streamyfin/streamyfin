import { useTranslation } from "react-i18next";
import { Stepper } from "../../inputs/Stepper";
import { ListItem } from "../../list/ListItem";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  pluginSettings?: any;
}

export const SubtitleSizeStepper: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  return (
    <ListItem
      title={t("home.settings.subtitles.subtitle_size")}
      disabled={pluginSettings?.subtitleSize?.locked}
    >
      <Stepper
        value={settings.subtitleSize / 100}
        disabled={pluginSettings?.subtitleSize?.locked}
        step={0.1}
        min={0.3}
        max={1.5}
        onUpdate={(value) =>
          updateSettings({ subtitleSize: Math.round(value * 100) })
        }
      />
    </ListItem>
  );
};
