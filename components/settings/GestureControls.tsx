import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, type ViewProps } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

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
        <ListItem
          title={t("home.settings.gesture_controls.horizontal_swipe_skip")}
          subtitle={t(
            "home.settings.gesture_controls.horizontal_swipe_skip_description",
          )}
          disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
        >
          <SettingSwitch
            value={settings.enableHorizontalSwipeSkip}
            disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
            onValueChange={(enableHorizontalSwipeSkip) =>
              updateSettings({ enableHorizontalSwipeSkip })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.gesture_controls.left_side_brightness")}
          subtitle={t(
            "home.settings.gesture_controls.left_side_brightness_description",
          )}
          disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
        >
          <SettingSwitch
            value={settings.enableLeftSideBrightnessSwipe}
            disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
            onValueChange={(enableLeftSideBrightnessSwipe) =>
              updateSettings({ enableLeftSideBrightnessSwipe })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.gesture_controls.right_side_volume")}
          subtitle={t(
            "home.settings.gesture_controls.right_side_volume_description",
          )}
          disabled={pluginSettings?.enableRightSideVolumeSwipe?.locked}
        >
          <SettingSwitch
            value={settings.enableRightSideVolumeSwipe}
            disabled={pluginSettings?.enableRightSideVolumeSwipe?.locked}
            onValueChange={(enableRightSideVolumeSwipe) =>
              updateSettings({ enableRightSideVolumeSwipe })
            }
          />
        </ListItem>

        {/* Hold-for-2x and pinch-to-zoom only exist in the iOS native
            player — showing dead toggles on Android would be misleading. */}
        {Platform.OS === "ios" && !Platform.isTV && (
          <>
            <ListItem
              title={t("home.settings.gesture_controls.hold_to_speed")}
              subtitle={t(
                "home.settings.gesture_controls.hold_to_speed_description",
              )}
              disabled={pluginSettings?.enableHoldToSpeed?.locked}
            >
              <SettingSwitch
                value={settings.enableHoldToSpeed}
                disabled={pluginSettings?.enableHoldToSpeed?.locked}
                onValueChange={(enableHoldToSpeed) =>
                  updateSettings({ enableHoldToSpeed })
                }
              />
            </ListItem>

            <ListItem
              title={t("home.settings.gesture_controls.pinch_to_zoom")}
              subtitle={t(
                "home.settings.gesture_controls.pinch_to_zoom_description",
              )}
              disabled={pluginSettings?.enablePinchToZoom?.locked}
            >
              <SettingSwitch
                value={settings.enablePinchToZoom}
                disabled={pluginSettings?.enablePinchToZoom?.locked}
                onValueChange={(enablePinchToZoom) =>
                  updateSettings({ enablePinchToZoom })
                }
              />
            </ListItem>
          </>
        )}

        <ListItem
          title={t("home.settings.gesture_controls.hide_volume_slider")}
          subtitle={t(
            "home.settings.gesture_controls.hide_volume_slider_description",
          )}
          disabled={pluginSettings?.hideVolumeSlider?.locked}
        >
          <SettingSwitch
            value={settings.hideVolumeSlider}
            disabled={pluginSettings?.hideVolumeSlider?.locked}
            onValueChange={(hideVolumeSlider) =>
              updateSettings({ hideVolumeSlider })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.gesture_controls.hide_brightness_slider")}
          subtitle={t(
            "home.settings.gesture_controls.hide_brightness_slider_description",
          )}
          disabled={pluginSettings?.hideBrightnessSlider?.locked}
        >
          <SettingSwitch
            value={settings.hideBrightnessSlider}
            disabled={pluginSettings?.hideBrightnessSlider?.locked}
            onValueChange={(hideBrightnessSlider) =>
              updateSettings({ hideBrightnessSlider })
            }
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
