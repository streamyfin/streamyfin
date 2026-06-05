import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { SettingsSwitchRow } from "@/components/settings/index/SettingsSwitchRow";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";

interface Props extends ViewProps {}

export const GestureControls: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const { settings, updateSettings, pluginSettings } = useSettings();

  const disabled = useMemo(
    () =>
      pluginSettings?.enableHorizontalSwipeSkip?.locked === true &&
      pluginSettings?.enableLeftSideBrightnessSwipe?.locked === true &&
      pluginSettings?.enableRightSideVolumeSwipe?.locked === true &&
      pluginSettings?.hideVolumeSlider?.locked === true &&
      pluginSettings?.hideBrightnessSlider?.locked === true,
    [pluginSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup
        title={t("home.settings.gesture_controls.gesture_controls_title")}
      >
        <SettingsSwitchRow
          title={t("home.settings.gesture_controls.horizontal_swipe_skip")}
          subtitle={t(
            "home.settings.gesture_controls.horizontal_swipe_skip_description",
          )}
          disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
          value={settings.enableHorizontalSwipeSkip}
          onValueChange={(enableHorizontalSwipeSkip) =>
            updateSettings({ enableHorizontalSwipeSkip })
          }
        />

        <SettingsSwitchRow
          title={t("home.settings.gesture_controls.left_side_brightness")}
          subtitle={t(
            "home.settings.gesture_controls.left_side_brightness_description",
          )}
          disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
          value={settings.enableLeftSideBrightnessSwipe}
          onValueChange={(enableLeftSideBrightnessSwipe) =>
            updateSettings({ enableLeftSideBrightnessSwipe })
          }
        />

        <SettingsSwitchRow
          title={t("home.settings.gesture_controls.right_side_volume")}
          subtitle={t(
            "home.settings.gesture_controls.right_side_volume_description",
          )}
          disabled={pluginSettings?.enableRightSideVolumeSwipe?.locked}
          value={settings.enableRightSideVolumeSwipe}
          onValueChange={(enableRightSideVolumeSwipe) =>
            updateSettings({ enableRightSideVolumeSwipe })
          }
        />

        <SettingsSwitchRow
          title={t("home.settings.gesture_controls.hide_volume_slider")}
          subtitle={t(
            "home.settings.gesture_controls.hide_volume_slider_description",
          )}
          disabled={pluginSettings?.hideVolumeSlider?.locked}
          value={settings.hideVolumeSlider}
          onValueChange={(hideVolumeSlider) =>
            updateSettings({ hideVolumeSlider })
          }
        />

        <SettingsSwitchRow
          title={t("home.settings.gesture_controls.hide_brightness_slider")}
          subtitle={t(
            "home.settings.gesture_controls.hide_brightness_slider_description",
          )}
          disabled={pluginSettings?.hideBrightnessSlider?.locked}
          value={settings.hideBrightnessSlider}
          onValueChange={(hideBrightnessSlider) =>
            updateSettings({ hideBrightnessSlider })
          }
        />
      </ListGroup>
    </DisabledSetting>
  );
};
