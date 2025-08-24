import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { Switch, Text } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const GestureControls: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const [settings, updateSettings, pluginSettings] = useSettings();

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
          disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
          title={t("home.settings.gesture_controls.horizontal_swipe_skip")}
        >
          <Text style={{ color: "gray", marginBottom: 4 }}>
            {t(
              "home.settings.gesture_controls.horizontal_swipe_skip_description",
            )}
          </Text>
          <Switch
            value={settings.enableHorizontalSwipeSkip}
            disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
            onValueChange={(enableHorizontalSwipeSkip) =>
              updateSettings({ enableHorizontalSwipeSkip })
            }
          />
        </ListItem>

        <ListItem
          disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
          title={t("home.settings.gesture_controls.left_side_brightness")}
        >
          <Text style={{ color: "gray", marginBottom: 4 }}>
            {t(
              "home.settings.gesture_controls.left_side_brightness_description",
            )}
          </Text>
          <Switch
            value={settings.enableLeftSideBrightnessSwipe}
            disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
            onValueChange={(enableLeftSideBrightnessSwipe) =>
              updateSettings({ enableLeftSideBrightnessSwipe })
            }
          />
        </ListItem>

        <ListItem
          disabled={pluginSettings?.enableRightSideVolumeSwipe?.locked}
          title={t("home.settings.gesture_controls.right_side_volume")}
        >
          <Text style={{ color: "gray", marginBottom: 4 }}>
            {t("home.settings.gesture_controls.right_side_volume_description")}
          </Text>
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
