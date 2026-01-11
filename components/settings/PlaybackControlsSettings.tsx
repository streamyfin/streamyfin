import { Ionicons } from "@expo/vector-icons";
import { TFunction } from "i18next";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Switch, View } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import DisabledSetting from "@/components/settings/DisabledSetting";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { ScreenOrientationEnum, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

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
    ScreenOrientation.OrientationLock.LANDSCAPE_LEFT,
    ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
  ];

  const orientationTranslations = useMemo(
    () => ({
      [ScreenOrientation.OrientationLock.DEFAULT]:
        "home.settings.other.orientations.DEFAULT",
      [ScreenOrientation.OrientationLock.PORTRAIT_UP]:
        "home.settings.other.orientations.PORTRAIT_UP",
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
          <Switch
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
          <Switch
            value={settings.disableHapticFeedback}
            disabled={pluginSettings?.disableHapticFeedback?.locked}
            onValueChange={(disableHapticFeedback) =>
              updateSettings({ disableHapticFeedback })
            }
          />
        </ListItem>

        <ListItem title={t("home.settings.other.max_auto_play_episode_count")}>
          <PlatformDropdown
            groups={autoPlayEpisodeOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(settings?.maxAutoPlayEpisodeCount.key)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.max_auto_play_episode_count")}
          />
        </ListItem>
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
