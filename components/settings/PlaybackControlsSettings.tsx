import { TFunction } from "i18next";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BITRATES } from "@/components/BitrateSelector";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { SettingsSelectRow } from "@/components/settings/index/SettingsSelectRow";
import { SettingsSwitchRow } from "@/components/settings/index/SettingsSwitchRow";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";

export const PlaybackControlsSettings: React.FC = () => {
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

  const autoPlayEpisodeOptions = useMemo(
    () => [
      {
        options: AUTOPLAY_EPISODES_COUNT(t).map((item) => ({
          type: "radio" as const,
          label: item.key,
          value: item.key,
          selected: item.key === settings?.maxAutoPlayEpisodeCount?.key,
          onPress: () => updateSettings({ maxAutoPlayEpisodeCount: item }),
        })),
      },
    ],
    [settings?.maxAutoPlayEpisodeCount?.key, t, updateSettings],
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
      <ListGroup title={t("home.settings.other.other_title")} className=''>
        <SettingsSelectRow
          title={t("home.settings.other.video_orientation")}
          disabled={pluginSettings?.defaultVideoOrientation?.locked}
          valueLabel={
            t(
              orientationTranslations[
                settings.defaultVideoOrientation as keyof typeof orientationTranslations
              ],
            ) || "Unknown Orientation"
          }
          groups={orientationOptions}
          dropdownTitle={t("home.settings.other.orientation")}
        />

        <SettingsSwitchRow
          title={t("home.settings.other.safe_area_in_controls")}
          disabled={pluginSettings?.safeAreaInControlsEnabled?.locked}
          value={settings.safeAreaInControlsEnabled}
          onValueChange={(value) =>
            updateSettings({ safeAreaInControlsEnabled: value })
          }
        />

        <SettingsSelectRow
          title={t("home.settings.other.default_quality")}
          disabled={pluginSettings?.defaultBitrate?.locked}
          valueLabel={settings.defaultBitrate?.key}
          groups={bitrateOptions}
          dropdownTitle={t("home.settings.other.default_quality")}
        />

        <SettingsSelectRow
          title={t("home.settings.other.default_playback_speed")}
          disabled={pluginSettings?.defaultPlaybackSpeed?.locked}
          valueLabel={
            PLAYBACK_SPEEDS.find(
              (s) => s.value === settings.defaultPlaybackSpeed,
            )?.label ?? "1x"
          }
          groups={playbackSpeedOptions}
          dropdownTitle={t("home.settings.other.default_playback_speed")}
        />

        <SettingsSwitchRow
          title={t("home.settings.other.disable_haptic_feedback")}
          disabled={pluginSettings?.disableHapticFeedback?.locked}
          value={settings.disableHapticFeedback}
          onValueChange={(disableHapticFeedback) =>
            updateSettings({ disableHapticFeedback })
          }
        />

        <SettingsSwitchRow
          title={t("home.settings.other.auto_play_next_episode")}
          disabled={pluginSettings?.autoPlayNextEpisode?.locked}
          value={settings.autoPlayNextEpisode}
          onValueChange={(autoPlayNextEpisode) =>
            updateSettings({ autoPlayNextEpisode })
          }
        />

        <SettingsSelectRow
          title={t("home.settings.other.max_auto_play_episode_count")}
          disabled={
            !settings.autoPlayNextEpisode ||
            pluginSettings?.maxAutoPlayEpisodeCount?.locked
          }
          valueLabel={t(settings?.maxAutoPlayEpisodeCount.key)}
          groups={autoPlayEpisodeOptions}
          dropdownTitle={t("home.settings.other.max_auto_play_episode_count")}
        />
      </ListGroup>
    </DisabledSetting>
  );
};

const AUTOPLAY_EPISODES_COUNT = (
  t: TFunction<"translation", undefined>,
): {
  key: string;
  value: number;
}[] => [
  { key: t("home.settings.other.disabled"), value: -1 },
  { key: "1", value: 1 },
  { key: "2", value: 2 },
  { key: "3", value: 3 },
  { key: "4", value: 4 },
  { key: "5", value: 5 },
  { key: "6", value: 6 },
  { key: "7", value: 7 },
];
