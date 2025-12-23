import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useMemo } from "react";
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

type GestureMode = "none" | "doubleTap" | "swipe";

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

  // Determine current gesture mode
  const currentGestureMode = useMemo((): GestureMode => {
    if (settings.enableDoubleTapToSeek && !settings.enableHorizontalSwipeSkip) {
      return "doubleTap";
    }
    if (settings.enableHorizontalSwipeSkip && !settings.enableDoubleTapToSeek) {
      return "swipe";
    }
    if (
      !settings.enableDoubleTapToSeek &&
      !settings.enableHorizontalSwipeSkip
    ) {
      return "none";
    }
    // If both are enabled, default to doubleTap
    return "doubleTap";
  }, [settings.enableDoubleTapToSeek, settings.enableHorizontalSwipeSkip]);

  // Handle gesture mode change
  const handleGestureModeChange = useCallback(
    (mode: GestureMode) => {
      switch (mode) {
        case "none":
          updateSettings({
            enableDoubleTapToSeek: false,
            enableHorizontalSwipeSkip: false,
          });
          break;
        case "doubleTap":
          updateSettings({
            enableDoubleTapToSeek: true,
            enableHorizontalSwipeSkip: false,
          });
          break;
        case "swipe":
          updateSettings({
            enableDoubleTapToSeek: false,
            enableHorizontalSwipeSkip: true,
          });
          break;
      }
    },
    [updateSettings],
  );

  // Build dropdown groups with radio options
  const smartGesturesOptions = useMemo(
    () => [
      {
        options: [
          {
            type: "radio" as const,
            label: t("home.settings.gesture_controls.gesture_mode_none"),
            value: "none",
            selected: currentGestureMode === "none",
            onPress: () => handleGestureModeChange("none"),
            disabled:
              pluginSettings?.enableHorizontalSwipeSkip?.locked ||
              pluginSettings?.enableDoubleTapToSeek?.locked,
          },
          {
            type: "radio" as const,
            label: `${t("home.settings.gesture_controls.gesture_mode_double_tap")}\n${t("home.settings.gesture_controls.double_tap_to_seek_description")}`,
            value: "doubleTap",
            selected: currentGestureMode === "doubleTap",
            onPress: () => handleGestureModeChange("doubleTap"),
            disabled:
              pluginSettings?.enableHorizontalSwipeSkip?.locked ||
              pluginSettings?.enableDoubleTapToSeek?.locked,
          },
          {
            type: "radio" as const,
            label: `${t("home.settings.gesture_controls.gesture_mode_swipe")}\n${t("home.settings.gesture_controls.horizontal_swipe_skip_description")}`,
            value: "swipe",
            selected: currentGestureMode === "swipe",
            onPress: () => handleGestureModeChange("swipe"),
            disabled:
              pluginSettings?.enableHorizontalSwipeSkip?.locked ||
              pluginSettings?.enableDoubleTapToSeek?.locked,
          },
        ],
      },
    ],
    [currentGestureMode, handleGestureModeChange, pluginSettings, t],
  );

  // Get display text for current mode
  const smartGesturesStatus = useMemo(() => {
    switch (currentGestureMode) {
      case "doubleTap":
        return t("home.settings.gesture_controls.gesture_mode_double_tap");
      case "swipe":
        return t("home.settings.gesture_controls.gesture_mode_swipe");
      default:
        return t("home.settings.gesture_controls.gesture_mode_none");
    }
  }, [currentGestureMode, t]);

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
