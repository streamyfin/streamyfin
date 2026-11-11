import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { bitrateOptions } from "@/components/BitrateSelector";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  AUTO_BITRATE_IN_NETWORK_MIN_CHOICES,
  AUTO_BITRATE_RATIO_CHOICES,
  AUTO_BITRATE_TTL_CHOICES,
} from "@/constants/Bitrate";
import { useAutoBitrateMeasure } from "@/hooks/useAutoBitrateMeasure";
import { useSettings } from "@/utils/atoms/settings";
import {
  autoBitrateFloorLabel,
  autoBitrateRatioLabel,
  autoBitrateTtlLabel,
  lastMeasureLabel,
} from "@/utils/autoBitrateLabels";
import { bitrateLabel } from "@/utils/bitrate";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

/** The radio choices of one Auto setting, the one set marked. */
const choices = <T extends number>(
  values: readonly T[],
  selected: number | undefined,
  label: (value: T) => string,
  save: (value: T) => void,
) => [
  {
    options: values.map((value) => ({
      type: "radio" as const,
      label: label(value),
      value: String(value),
      selected: value === selected,
      onPress: () => save(value),
    })),
  },
];

const Trigger: React.FC<{ label: string }> = ({ label }) => (
  <View className='flex flex-row items-center justify-between pl-3 py-1.5 '>
    <Text className='mr-1 text-[#8E8D91]'>{label}</Text>
    <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
  </View>
);

/**
 * Everything that decides the bitrate, in one group as on TV: the default
 * quality, then how Auto measures the connection to the server, which
 * jellyfin-web fixes: the share of the measured speed a stream takes, how long
 * a measure is used, and the least a stream gets in the server's network. With
 * the measure Auto streams at now, and a way to run one.
 */
export const QualitySettings: React.FC = () => {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t, i18n } = useTranslation();
  const { last, measuring, measure } = useAutoBitrateMeasure();

  if (!settings) return null;

  const defaultQuality = t("home.settings.other.default_quality");
  const share = t("home.settings.quality.share");
  const remeasureAfter = t("home.settings.quality.remeasure_after");
  const floor = t("home.settings.quality.in_network_min");
  const lastMeasure = lastMeasureLabel(t, last, i18n.language);

  return (
    <ListGroup
      title={t("home.settings.quality.title")}
      description={
        <Text className='text-[#8E8D91] text-xs'>
          {t("home.settings.quality.description")}
        </Text>
      }
      className='mb-4'
    >
      <ListItem
        title={defaultQuality}
        disabled={pluginSettings?.defaultBitrate?.locked}
      >
        <PlatformDropdown
          groups={[
            {
              options: bitrateOptions(t, settings.defaultBitrate).map(
                ({ label, value: bitrate, selected }) => ({
                  type: "radio" as const,
                  label,
                  value: bitrate.key,
                  selected,
                  onPress: () => updateSettings({ defaultBitrate: bitrate }),
                }),
              ),
            },
          ]}
          trigger={
            <Trigger
              label={
                settings.defaultBitrate
                  ? bitrateLabel(t, settings.defaultBitrate)
                  : ""
              }
            />
          }
          title={defaultQuality}
        />
      </ListItem>
      <ListItem title={share}>
        <PlatformDropdown
          groups={choices(
            AUTO_BITRATE_RATIO_CHOICES,
            settings.autoBitrateRatio,
            (ratio) => autoBitrateRatioLabel(ratio, i18n.language),
            (ratio) => updateSettings({ autoBitrateRatio: ratio }),
          )}
          trigger={
            <Trigger
              label={autoBitrateRatioLabel(
                settings.autoBitrateRatio,
                i18n.language,
              )}
            />
          }
          title={share}
        />
      </ListItem>
      <ListItem title={remeasureAfter}>
        <PlatformDropdown
          groups={choices(
            AUTO_BITRATE_TTL_CHOICES,
            settings.autoBitrateTtlMinutes,
            (minutes) => autoBitrateTtlLabel(t, minutes),
            (minutes) => updateSettings({ autoBitrateTtlMinutes: minutes }),
          )}
          trigger={
            <Trigger
              label={autoBitrateTtlLabel(t, settings.autoBitrateTtlMinutes)}
            />
          }
          title={remeasureAfter}
        />
      </ListItem>
      <ListItem title={floor}>
        <PlatformDropdown
          groups={choices(
            AUTO_BITRATE_IN_NETWORK_MIN_CHOICES,
            settings.autoBitrateInNetworkMin,
            (bitrate) => autoBitrateFloorLabel(t, bitrate),
            (bitrate) => updateSettings({ autoBitrateInNetworkMin: bitrate }),
          )}
          trigger={
            <Trigger
              label={autoBitrateFloorLabel(t, settings.autoBitrateInNetworkMin)}
            />
          }
          title={floor}
        />
      </ListItem>
      <ListItem title={t("home.settings.quality.adapt")}>
        <SettingSwitch
          value={settings.autoBitrateAdapt}
          onValueChange={(autoBitrateAdapt) =>
            updateSettings({ autoBitrateAdapt })
          }
        />
      </ListItem>
      <ListItem
        title={t("home.settings.quality.last_measure")}
        value={lastMeasure}
      />
      <ListItem
        title={
          measuring
            ? t("home.settings.quality.measuring")
            : t("home.settings.quality.measure_now")
        }
        textColor='blue'
        disabled={measuring}
        onPress={measure}
      />
    </ListGroup>
  );
};
