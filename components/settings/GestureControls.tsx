import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { Switch, View } from "react-native";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const GestureControls: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const { settings, updateSettings, pluginSettings } = useSettings();

  const disabled = useMemo(
    () =>
      pluginSettings?.enableHorizontalSwipeSkip?.locked === true &&
      pluginSettings?.enableDoubleTapToSeek?.locked === true &&
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
        {/* Smart Gestures Section */}
        <View className='px-4 py-2 bg-neutral-800/50'>
          <Text className='text-sm font-semibold text-neutral-300'>
            {t("home.settings.gesture_controls.smart_gestures")}
          </Text>
          <Text className='text-xs text-neutral-500 mt-0.5'>
            {t("home.settings.gesture_controls.smart_gestures_description")}
          </Text>
        </View>

        <ListItem
          title={t("home.settings.gesture_controls.horizontal_swipe_skip")}
          subtitle={t(
            "home.settings.gesture_controls.horizontal_swipe_skip_description",
          )}
          disabled={pluginSettings?.enableHorizontalSwipeSkip?.locked}
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
          title={t("home.settings.gesture_controls.double_tap_to_seek")}
          subtitle={t(
            "home.settings.gesture_controls.double_tap_to_seek_description",
          )}
          disabled={pluginSettings?.enableDoubleTapToSeek?.locked}
        >
          <Switch
            value={settings.enableDoubleTapToSeek}
            disabled={pluginSettings?.enableDoubleTapToSeek?.locked}
            onValueChange={(enableDoubleTapToSeek) =>
              updateSettings({ enableDoubleTapToSeek })
            }
          />
        </ListItem>

        {settings.enableHorizontalSwipeSkip &&
          settings.enableDoubleTapToSeek && (
            <View className='bg-yellow-900/20 border border-yellow-600/30 rounded-lg mx-4 my-2 p-3'>
              <Text className='text-yellow-500 text-xs'>
                {t("home.settings.gesture_controls.smart_gestures_warning")}
              </Text>
            </View>
          )}

        {/* Other Gestures Section */}
        <View className='px-4 py-2 bg-neutral-800/50 mt-2'>
          <Text className='text-sm font-semibold text-neutral-300'>
            {t("home.settings.gesture_controls.other_gestures")}
          </Text>
        </View>

        <ListItem
          title={t("home.settings.gesture_controls.left_side_brightness")}
          subtitle={t(
            "home.settings.gesture_controls.left_side_brightness_description",
          )}
          disabled={pluginSettings?.enableLeftSideBrightnessSwipe?.locked}
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
