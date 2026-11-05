import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import DisabledSetting from "@/components/settings/DisabledSetting";
import {
  getActiveVideoPlayer,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props extends ViewProps {}

export const GestureControls: React.FC<Props> = ({ ...props }) => {
  const { t } = useTranslation();

  const { settings, updateSettings, pluginSettings } = useSettings();

  // Pinch-to-zoom and double-tap-to-seek are implemented by the native player
  // only (iOS by default, Android opt-in) — the JS player has neither, and the
  // Siri remote has no equivalent, so the rows stay hidden everywhere else.
  const isNativeTouchPlayer = useMemo(
    () =>
      !Platform.isTV && getActiveVideoPlayer(settings) === VideoPlayer.Native,
    [settings],
  );

  const disabled = useMemo(
    () =>
      pluginSettings?.enablePlayerGestures?.locked === true &&
      pluginSettings?.enableHorizontalSwipeSkip?.locked === true &&
      pluginSettings?.enableLeftSideBrightnessSwipe?.locked === true &&
      pluginSettings?.enableRightSideVolumeSwipe?.locked === true &&
      pluginSettings?.enableHoldToSpeed?.locked === true &&
      pluginSettings?.holdToSpeedRate?.locked === true &&
      pluginSettings?.enablePinchToZoom?.locked === true &&
      pluginSettings?.enableDoubleTapToSeek?.locked === true &&
      pluginSettings?.hideVolumeSlider?.locked === true &&
      pluginSettings?.hideBrightnessSlider?.locked === true,
    [pluginSettings],
  );

  const holdToSpeedRateOptions = useMemo(
    () => [
      {
        options: PLAYBACK_SPEEDS.map((speed) => ({
          type: "radio" as const,
          label: speed.label,
          value: speed.value,
          selected: speed.value === settings?.holdToSpeedRate,
          onPress: () => updateSettings({ holdToSpeedRate: speed.value }),
        })),
      },
    ],
    [settings?.holdToSpeedRate, updateSettings],
  );

  if (!settings) return null;

  // With the master switch off every gesture row below is moot: shown, so
  // what comes back on is visible, but not editable.
  const gesturesOff = settings.enablePlayerGestures === false;

  return (
    <DisabledSetting disabled={disabled} {...props}>
      <ListGroup
        title={t("home.settings.gesture_controls.gesture_controls_title")}
      >
        <ListItem
          title={t("home.settings.gesture_controls.player_gestures")}
          subtitle={t(
            "home.settings.gesture_controls.player_gestures_description",
          )}
          disabled={pluginSettings?.enablePlayerGestures?.locked === true}
        >
          <SettingSwitch
            value={settings.enablePlayerGestures !== false}
            disabled={pluginSettings?.enablePlayerGestures?.locked === true}
            onValueChange={(enablePlayerGestures) =>
              updateSettings({ enablePlayerGestures })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.gesture_controls.horizontal_swipe_skip")}
          subtitle={t(
            "home.settings.gesture_controls.horizontal_swipe_skip_description",
          )}
          disabled={
            gesturesOff ||
            pluginSettings?.enableHorizontalSwipeSkip?.locked === true
          }
        >
          <SettingSwitch
            value={settings.enableHorizontalSwipeSkip}
            disabled={
              gesturesOff ||
              pluginSettings?.enableHorizontalSwipeSkip?.locked === true
            }
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
          disabled={
            gesturesOff ||
            pluginSettings?.enableLeftSideBrightnessSwipe?.locked === true
          }
        >
          <SettingSwitch
            value={settings.enableLeftSideBrightnessSwipe}
            disabled={
              gesturesOff ||
              pluginSettings?.enableLeftSideBrightnessSwipe?.locked === true
            }
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
          disabled={
            gesturesOff ||
            pluginSettings?.enableRightSideVolumeSwipe?.locked === true
          }
        >
          <SettingSwitch
            value={settings.enableRightSideVolumeSwipe}
            disabled={
              gesturesOff ||
              pluginSettings?.enableRightSideVolumeSwipe?.locked === true
            }
            onValueChange={(enableRightSideVolumeSwipe) =>
              updateSettings({ enableRightSideVolumeSwipe })
            }
          />
        </ListItem>

        {/* Hold-to-speed also exists in the JS player, so it is not
            iOS-only, but it is still a touch gesture with no Siri remote
            equivalent. Each item is gated individually: ListGroup clones
            its children to inject separator styles, which a Fragment
            can't accept. */}
        {!Platform.isTV && (
          <ListItem
            title={t("home.settings.gesture_controls.hold_to_speed")}
            subtitle={t(
              "home.settings.gesture_controls.hold_to_speed_description",
            )}
            disabled={
              gesturesOff || pluginSettings?.enableHoldToSpeed?.locked === true
            }
          >
            <SettingSwitch
              value={settings.enableHoldToSpeed}
              disabled={
                gesturesOff ||
                pluginSettings?.enableHoldToSpeed?.locked === true
              }
              onValueChange={(enableHoldToSpeed) =>
                updateSettings({ enableHoldToSpeed })
              }
            />
          </ListItem>
        )}

        {!Platform.isTV && (
          <DisabledSetting
            disabled={
              gesturesOff ||
              !settings.enableHoldToSpeed ||
              pluginSettings?.holdToSpeedRate?.locked === true
            }
            showText={false}
          >
            <ListItem
              title={t("home.settings.gesture_controls.hold_to_speed_rate")}
              disabled={pluginSettings?.holdToSpeedRate?.locked === true}
            >
              <PlatformDropdown
                groups={holdToSpeedRateOptions}
                trigger={
                  <View className='flex flex-row items-center justify-between pl-3 py-1.5'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {PLAYBACK_SPEEDS.find(
                        (s) => s.value === settings.holdToSpeedRate,
                      )?.label ?? "2x"}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t("home.settings.gesture_controls.hold_to_speed_rate")}
              />
            </ListItem>
          </DisabledSetting>
        )}

        {isNativeTouchPlayer && (
          <ListItem
            title={t("home.settings.gesture_controls.pinch_to_zoom")}
            subtitle={t(
              "home.settings.gesture_controls.pinch_to_zoom_description",
            )}
            disabled={
              gesturesOff || pluginSettings?.enablePinchToZoom?.locked === true
            }
          >
            <SettingSwitch
              value={settings.enablePinchToZoom}
              disabled={
                gesturesOff ||
                pluginSettings?.enablePinchToZoom?.locked === true
              }
              onValueChange={(enablePinchToZoom) =>
                updateSettings({ enablePinchToZoom })
              }
            />
          </ListItem>
        )}

        {isNativeTouchPlayer && (
          <ListItem
            title={t("home.settings.gesture_controls.double_tap_to_seek")}
            subtitle={t(
              "home.settings.gesture_controls.double_tap_to_seek_description",
            )}
            disabled={
              gesturesOff ||
              pluginSettings?.enableDoubleTapToSeek?.locked === true
            }
          >
            <SettingSwitch
              value={settings.enableDoubleTapToSeek}
              disabled={
                gesturesOff ||
                pluginSettings?.enableDoubleTapToSeek?.locked === true
              }
              onValueChange={(enableDoubleTapToSeek) =>
                updateSettings({ enableDoubleTapToSeek })
              }
            />
          </ListItem>
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
