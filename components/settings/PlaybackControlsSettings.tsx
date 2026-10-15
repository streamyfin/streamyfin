import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { stillWatchingPresetLabel } from "@/components/settings/stillWatchingPresetLabel";
import { STILL_WATCHING_PRESET_ORDER } from "@/constants/StillWatching";
import useRouter from "@/hooks/useAppRouter";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import { coerceStillWatchingPreset } from "@/utils/stillWatching";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const PlaybackControlsSettings: React.FC = () => {
  const router = useRouter();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();

  const disabled = useMemo(
    () =>
      pluginSettings?.defaultVideoOrientation?.locked === true &&
      pluginSettings?.safeAreaInControlsEnabled?.locked === true &&
      pluginSettings?.disableHapticFeedback?.locked === true,
    [pluginSettings],
  );

  const orientations = [
    ScreenOrientation.OrientationLock.DEFAULT,
    ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ScreenOrientation.OrientationLock.LANDSCAPE,
    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
  ];

  const orientationTranslations = useMemo(
    () => ({
      [ScreenOrientation.OrientationLock.DEFAULT]:
        "home.settings.other.orientations.DEFAULT",
      [ScreenOrientation.OrientationLock.PORTRAIT_UP]:
        "home.settings.other.orientations.PORTRAIT_UP",
      [ScreenOrientation.OrientationLock.LANDSCAPE]:
        "home.settings.other.orientations.LANDSCAPE",
      [ScreenOrientation.OrientationLock.LANDSCAPE_LEFT]:
        "home.settings.other.orientations.LANDSCAPE_LEFT",
      [ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT]:
        "home.settings.other.orientations.LANDSCAPE_RIGHT",
    }),
    [],
  );

  const orientationOptions = useMemo(
    () => [
      {
        options: orientations.map((orientation) => ({
          type: "radio" as const,
          label: t(ScreenOrientationEnum[orientation]),
          value: String(orientation),
          selected: orientation === settings?.defaultVideoOrientation,
          onPress: () =>
            updateSettings({ defaultVideoOrientation: orientation }),
        })),
      },
    ],
    [orientations, settings?.defaultVideoOrientation, t, updateSettings],
  );

  const bitrateOptions = useMemo(
    () => [
      {
        options: BITRATES.map((bitrate) => ({
          type: "radio" as const,
          label: bitrate.key,
          value: bitrate.key,
          selected: bitrate.key === settings?.defaultBitrate?.key,
          onPress: () => updateSettings({ defaultBitrate: bitrate }),
        })),
      },
    ],
    [settings?.defaultBitrate?.key, updateSettings],
  );

  const stillWatchingOptions = useMemo(
    () => [
      {
        options: STILL_WATCHING_PRESET_ORDER.map((preset) => ({
          type: "radio" as const,
          label: stillWatchingPresetLabel(t, preset),
          value: preset,
          selected:
            preset === coerceStillWatchingPreset(settings?.stillWatchingPreset),
          onPress: () => updateSettings({ stillWatchingPreset: preset }),
        })),
      },
    ],
    [settings?.stillWatchingPreset, t, updateSettings],
  );

  const playbackSpeedOptions = useMemo(
    () => [
      {
        options: PLAYBACK_SPEEDS.map((speed) => ({
          type: "radio" as const,
          label: speed.label,
          value: speed.value,
          selected: speed.value === settings?.defaultPlaybackSpeed,
          onPress: () => updateSettings({ defaultPlaybackSpeed: speed.value }),
        })),
      },
    ],
    [settings?.defaultPlaybackSpeed, updateSettings],
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={disabled}>
      <ListGroup title={t("home.settings.other.other_title")} className='mb-4'>
        <ListItem
          title={t("home.settings.other.video_orientation")}
          disabled={pluginSettings?.defaultVideoOrientation?.locked}
        >
          <PlatformDropdown
            groups={orientationOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    orientationTranslations[
                      settings.defaultVideoOrientation as keyof typeof orientationTranslations
                    ],
                  ) || "Unknown Orientation"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.orientation")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.safe_area_in_controls")}
          disabled={pluginSettings?.safeAreaInControlsEnabled?.locked}
        >
          <SettingSwitch
            value={settings.safeAreaInControlsEnabled}
            disabled={pluginSettings?.safeAreaInControlsEnabled?.locked}
            onValueChange={(value) =>
              updateSettings({ safeAreaInControlsEnabled: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.default_quality")}
          disabled={pluginSettings?.defaultBitrate?.locked}
        >
          <PlatformDropdown
            groups={bitrateOptions}
            trigger={
              <View className='flex flex-row items-center justify-between pl-3 py-1.5 '>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings.defaultBitrate?.key}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.default_quality")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.default_playback_speed")}
          disabled={pluginSettings?.defaultPlaybackSpeed?.locked}
        >
          <PlatformDropdown
            groups={playbackSpeedOptions}
            trigger={
              <View className='flex flex-row items-center justify-between pl-3 py-1.5'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {PLAYBACK_SPEEDS.find(
                    (s) => s.value === settings.defaultPlaybackSpeed,
                  )?.label ?? "1x"}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.default_playback_speed")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.disable_haptic_feedback")}
          disabled={pluginSettings?.disableHapticFeedback?.locked}
        >
          <SettingSwitch
            value={settings.disableHapticFeedback}
            disabled={pluginSettings?.disableHapticFeedback?.locked}
            onValueChange={(disableHapticFeedback) =>
              updateSettings({ disableHapticFeedback })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.resume_dialog")}
          disabled={pluginSettings?.showResumeDialog?.locked}
        >
          <SettingSwitch
            value={settings.showResumeDialog}
            disabled={pluginSettings?.showResumeDialog?.locked}
            onValueChange={(showResumeDialog) =>
              updateSettings({ showResumeDialog })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.auto_play_next_episode")}
          disabled={pluginSettings?.autoPlayNextEpisode?.locked}
        >
          <SettingSwitch
            value={settings.autoPlayNextEpisode}
            disabled={pluginSettings?.autoPlayNextEpisode?.locked}
            onValueChange={(autoPlayNextEpisode) =>
              updateSettings({ autoPlayNextEpisode })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.still_watching")}
          subtitle={t("home.settings.other.still_watching_hint")}
          disabled={
            !settings.autoPlayNextEpisode ||
            pluginSettings?.stillWatchingPreset?.locked
          }
        >
          <PlatformDropdown
            groups={stillWatchingOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {stillWatchingPresetLabel(t, settings.stillWatchingPreset)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.still_watching")}
          />
        </ListItem>

        {/* Media Segment Skip Settings */}
        <ListItem
          title={t("home.settings.other.segment_skip_settings")}
          subtitle={t("home.settings.other.segment_skip_settings_description")}
          onPress={() => router.push("/settings/segment-skip/page")}
        >
          <Ionicons name='chevron-forward' size={20} color='#8E8D91' />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
};
