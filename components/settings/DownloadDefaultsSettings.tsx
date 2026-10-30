import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  DOWNLOAD_MODE_LABEL_KEYS,
  DOWNLOAD_MODES,
  DOWNLOAD_VIDEO_CODECS,
} from "@/constants/Downloads";
import {
  AUDIO_TRANSCODE_MODE_LABEL_KEYS,
  AUDIO_TRANSCODE_MODES,
} from "@/constants/Playback";
import {
  downloadDefaults,
  videoCodecLabel,
} from "@/providers/Downloads/downloadRequest";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

type Choice = { label: string; selected: boolean; apply: Partial<Settings> };

const DefaultPicker = ({
  title,
  value,
  choices,
  onChange,
}: {
  title: string;
  value: string;
  choices: Choice[];
  onChange: (update: Partial<Settings>) => void;
}) => (
  <ListItem title={title}>
    <PlatformDropdown
      groups={[
        {
          options: choices.map((choice) => ({
            type: "radio" as const,
            label: choice.label,
            value: choice.label,
            selected: choice.selected,
            onPress: () => onChange(choice.apply),
          })),
        },
      ]}
      trigger={
        <View className='flex flex-row items-center justify-between pl-3 py-1.5'>
          <Text className='mr-1 text-[#8E8D91]'>{value}</Text>
          <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
        </View>
      }
      title={title}
    />
  </ListItem>
);

export const DownloadDefaultsSettings = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const defaults = downloadDefaults(settings);
  // Unset follows the playback audio setting, which downloads used before.
  const downloadAudioMode = settings?.downloadAudioTranscodeMode;
  // Names the playback mode it follows: "Auto" on its own would read the same.
  const sameAsPlayback = t(
    "home.settings.storage.download_audio_same_as_playback",
    {
      mode: t(
        AUDIO_TRANSCODE_MODE_LABEL_KEYS[settings?.audioTranscodeMode ?? "auto"],
      ),
    },
  );

  return (
    <View className='flex flex-col space-y-4'>
      <ListGroup title={t("home.downloads.downloads_title")}>
        <DefaultPicker
          title={t("home.settings.storage.download_as")}
          value={t(DOWNLOAD_MODE_LABEL_KEYS[defaults.mode])}
          choices={DOWNLOAD_MODES.map((mode) => ({
            label: t(DOWNLOAD_MODE_LABEL_KEYS[mode]),
            selected: mode === defaults.mode,
            apply: { downloadMode: mode },
          }))}
          onChange={updateSettings}
        />
      </ListGroup>
      <ListGroup
        title={t("home.downloads.transcoding")}
        description={
          <Text className='text-xs text-neutral-500'>
            {t("home.settings.storage.download_transcoding_description")}
          </Text>
        }
      >
        <DefaultPicker
          title={t("item_card.quality")}
          value={defaults.bitrate.key}
          choices={BITRATES.map((bitrate) => ({
            label: bitrate.key,
            selected: bitrate.key === defaults.bitrate.key,
            apply: { defaultDownloadBitrate: bitrate },
          }))}
          onChange={updateSettings}
        />
        <DefaultPicker
          title={t("item_card.download.video_codec")}
          value={videoCodecLabel(defaults.videoCodec, t)}
          choices={DOWNLOAD_VIDEO_CODECS.map((codec) => ({
            label: videoCodecLabel(codec, t),
            selected: codec === defaults.videoCodec,
            apply: { downloadVideoCodec: codec },
          }))}
          onChange={updateSettings}
        />
        <DefaultPicker
          title={t("item_card.download.audio_channels")}
          value={
            downloadAudioMode
              ? t(AUDIO_TRANSCODE_MODE_LABEL_KEYS[downloadAudioMode])
              : sameAsPlayback
          }
          choices={[
            {
              label: sameAsPlayback,
              selected: !downloadAudioMode,
              apply: { downloadAudioTranscodeMode: undefined },
            },
            ...AUDIO_TRANSCODE_MODES.map((mode) => ({
              label: t(AUDIO_TRANSCODE_MODE_LABEL_KEYS[mode]),
              selected: mode === downloadAudioMode,
              apply: { downloadAudioTranscodeMode: mode },
            })),
          ]}
          onChange={updateSettings}
        />
      </ListGroup>
    </View>
  );
};
