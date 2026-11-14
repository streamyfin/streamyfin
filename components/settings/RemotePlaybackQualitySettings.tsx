import { Ionicons } from "@expo/vector-icons";
import { useStore } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { AUTO_BITRATE_KEY } from "@/constants/Bitrate";
import { settingsAtom, useSettings } from "@/utils/atoms/settings";
import { bitrateLabel, PLAYBACK_BITRATES } from "@/utils/bitrate";
import {
  forgetTarget,
  NO_REMOTE_QUALITY,
  setKindQuality,
  setTargetQuality,
} from "@/utils/cast/remoteQuality";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const Trigger: React.FC<{ label: string }> = ({ label }) => (
  <View className='flex flex-row items-center justify-between pl-3 py-1.5 '>
    <Text className='mr-1 text-[#8E8D91]'>{label}</Text>
    <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
  </View>
);

/**
 * The quality receivers play at: one for Chromecast, Auto unless set, then one per receiver the app connected to,
 * which follows Chromecast's until it is given its own. The item page's quality caps this device only.
 */
export const RemotePlaybackQualitySettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const store = useStore();
  // Locked by the admin: the section shows the plugin's quality and takes no change, as every other one does.
  const locked = pluginSettings?.remotePlaybackQuality?.locked === true;
  const quality = settings?.remotePlaybackQuality ?? NO_REMOTE_QUALITY;
  // Read at the press: the Android sheet keeps the options it opened with, and a receiver remembered since
  // would be dropped by writing back this render's list.
  const latest = () =>
    store.get(settingsAtom)?.remotePlaybackQuality ?? NO_REMOTE_QUALITY;
  const castKey = quality.byKind.cast ?? AUTO_BITRATE_KEY;
  // Auto, the cast's default, is named in the app's language; the caps by their key.
  const labelOf = (key: string) => {
    const bitrate = PLAYBACK_BITRATES.find((choice) => choice.key === key);
    return bitrate ? bitrateLabel(t, bitrate) : key;
  };
  const chromecast = t("home.settings.remote_quality.chromecast");
  const sameAsChromecast = t("home.settings.remote_quality.same_as_chromecast");

  return (
    <DisabledSetting disabled={locked}>
      <ListGroup
        title={t("home.settings.remote_quality.title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.remote_quality.description")}
          </Text>
        }
        className='mb-4'
      >
        <ListItem title={chromecast}>
          <PlatformDropdown
            title={chromecast}
            trigger={<Trigger label={labelOf(castKey)} />}
            accessibilityLabel={chromecast}
            accessibilityValue={labelOf(castKey)}
            groups={[
              {
                options: PLAYBACK_BITRATES.map((bitrate) => ({
                  type: "radio" as const,
                  label: bitrateLabel(t, bitrate),
                  value: bitrate.key,
                  selected: bitrate.key === castKey,
                  onPress: () =>
                    updateSettings({
                      remotePlaybackQuality: setKindQuality(
                        latest(),
                        "cast",
                        bitrate.key,
                      ),
                    }),
                })),
              },
            ]}
          />
        </ListItem>
        {quality.known.map((known) => {
          const own = quality.byTarget[known.id];
          return (
            <ListItem key={known.id} title={known.name}>
              <PlatformDropdown
                title={known.name}
                trigger={
                  <Trigger label={own ? labelOf(own) : sameAsChromecast} />
                }
                // Several receivers can share a quality: the control names its receiver too.
                accessibilityLabel={known.name}
                accessibilityValue={own ? labelOf(own) : sameAsChromecast}
                groups={[
                  {
                    options: [
                      {
                        type: "radio" as const,
                        label: sameAsChromecast,
                        value: "",
                        selected: own === undefined,
                        onPress: () =>
                          updateSettings({
                            remotePlaybackQuality: setTargetQuality(
                              latest(),
                              known.id,
                              undefined,
                            ),
                          }),
                      },
                      ...PLAYBACK_BITRATES.map((bitrate) => ({
                        type: "radio" as const,
                        label: bitrateLabel(t, bitrate),
                        value: bitrate.key,
                        selected: bitrate.key === own,
                        onPress: () =>
                          updateSettings({
                            remotePlaybackQuality: setTargetQuality(
                              latest(),
                              known.id,
                              bitrate.key,
                            ),
                          }),
                      })),
                    ],
                  },
                  {
                    options: [
                      {
                        type: "action" as const,
                        label: t("home.settings.remote_quality.forget"),
                        onPress: () =>
                          updateSettings({
                            remotePlaybackQuality: forgetTarget(
                              latest(),
                              known.id,
                            ),
                          }),
                      },
                    ],
                  },
                ]}
              />
            </ListItem>
          );
        })}
      </ListGroup>
    </DisabledSetting>
  );
};
