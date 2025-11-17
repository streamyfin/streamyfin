import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { Switch } from "react-native";
import { ListItem } from "@/components/list/ListItem";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import DisabledSetting from "./DisabledSetting";

interface Props extends ViewProps {}

export const ControlsSettings: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const { settings, updateSettings, pluginSettings } = useSettings();

  const disabled = useMemo(
    () =>
      pluginSettings?.showVolumeSlider?.locked === true &&
      pluginSettings?.showBrightnessSlider?.locked === true &&
      pluginSettings?.showSeekButtons?.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup title={t("home.settings.controls.controls_title")}>
        <ListItem
          title={t("home.settings.controls.show_volume_slider")}
          subtitle={t("home.settings.controls.show_volume_slider_description")}
          disabled={pluginSettings?.showVolumeSlider?.locked}
        >
          <Switch
            value={settings.showVolumeSlider}
            disabled={pluginSettings?.showVolumeSlider?.locked}
            onValueChange={(showVolumeSlider) =>
              updateSettings({ showVolumeSlider })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.controls.show_brightness_slider")}
          subtitle={t(
            "home.settings.controls.show_brightness_slider_description",
          )}
          disabled={pluginSettings?.showBrightnessSlider?.locked}
        >
          <Switch
            value={settings.showBrightnessSlider}
            disabled={pluginSettings?.showBrightnessSlider?.locked}
            onValueChange={(showBrightnessSlider) =>
              updateSettings({ showBrightnessSlider })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.controls.show_seek_buttons")}
          subtitle={t("home.settings.controls.show_seek_buttons_description")}
          disabled={pluginSettings?.showSeekButtons?.locked}
        >
          <Switch
            value={settings.showSeekButtons}
            disabled={pluginSettings?.showSeekButtons?.locked}
            onValueChange={(showSeekButtons) =>
              updateSettings({ showSeekButtons })
            }
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
