import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewProps } from "react-native";
import { Switch, View } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
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

  const smartGesturesOptions = useMemo(
    () => [
      {
        options: [
          {
            type: "toggle" as const,
            label: `${t("home.settings.gesture_controls.horizontal_swipe_skip")}\n${t("home.settings.gesture_controls.horizontal_swipe_skip_description")}`,
            value: settings?.enableHorizontalSwipeSkip ?? false,
            onToggle: () =>
              updateSettings({
                enableHorizontalSwipeSkip: !settings?.enableHorizontalSwipeSkip,
              }),
            disabled: pluginSettings?.enableHorizontalSwipeSkip?.locked,
          },
          {
            type: "toggle" as const,
            label: `${t("home.settings.gesture_controls.double_tap_to_seek")}\n${t("home.settings.gesture_controls.double_tap_to_seek_description")}`,
            value: settings?.enableDoubleTapToSeek ?? false,
            onToggle: () =>
              updateSettings({
                enableDoubleTapToSeek: !settings?.enableDoubleTapToSeek,
              }),
            disabled: pluginSettings?.enableDoubleTapToSeek?.locked,
          },
        ],
      },
    ],
    [settings, updateSettings, pluginSettings, t],
  );

  const smartGesturesStatus = useMemo(() => {
    const enabledCount = [
      settings?.enableHorizontalSwipeSkip,
      settings?.enableDoubleTapToSeek,
    ].filter(Boolean).length;

    if (enabledCount === 2)
      return t("home.settings.other.disabled") === "Disabled"
        ? "Both enabled"
        : "Both enabled";
    if (enabledCount === 1) return "1 enabled";
    return t("home.settings.other.disabled");
  }, [settings?.enableHorizontalSwipeSkip, settings?.enableDoubleTapToSeek, t]);

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup
        title={t("home.settings.gesture_controls.gesture_controls_title")}
      >
        <ListItem
          title={t("home.settings.gesture_controls.smart_gestures")}
          subtitle={t(
            "home.settings.gesture_controls.smart_gestures_description",
          )}
          disabled={
            pluginSettings?.enableHorizontalSwipeSkip?.locked &&
            pluginSettings?.enableDoubleTapToSeek?.locked
          }
        >
          <PlatformDropdown
            groups={smartGesturesOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {smartGesturesStatus}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.gesture_controls.smart_gestures")}
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
