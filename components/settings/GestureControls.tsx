import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { Switch } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const GestureControls: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const [settings, updateSettings, pluginSettings] = useSettings(null);

  const disabled = useMemo(
    () =>
      pluginSettings?.enableHorizontalSwipeSkip?.locked === true &&
      pluginSettings?.enableLeftSideBrightnessSwipe?.locked === true &&
      pluginSettings?.enableRightSideVolumeSwipe?.locked === true,
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
          style={{ minHeight: 72, paddingTop: 12, paddingBottom: 12 }}
        >
          <Switch
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
          style={{ minHeight: 72, paddingTop: 12, paddingBottom: 12 }}
        >
          <Switch
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
          style={{ minHeight: 72, paddingTop: 12, paddingBottom: 12 }}
        >
          <Switch
            value={settings.enableRightSideVolumeSwipe}
            disabled={pluginSettings?.enableRightSideVolumeSwipe?.locked}
            onValueChange={(enableRightSideVolumeSwipe) =>
              updateSettings({ enableRightSideVolumeSwipe })
            }
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
