import type React from "react";
import { useTranslation } from "react-i18next";
import { Switch, View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { BitrateSelector } from "../BitrateSelector";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { type OptionGroup, PlatformDropdown } from "../PlatformDropdown";

export const DownloadSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  if (!settings) return null;

  const codecOptions: OptionGroup[] = [
    {
      options: [
        {
          label: "H.264 (x264)",
          value: "libx264",
          type: "radio",
          selected: settings.localTranscodingCodec === "libx264",
          onPress: () => updateSettings({ localTranscodingCodec: "libx264" }),
        },
        {
          label: "H.265 (x265)",
          value: "libx265",
          type: "radio",
          selected: settings.localTranscodingCodec === "libx265",
          onPress: () => updateSettings({ localTranscodingCodec: "libx265" }),
        },
      ],
    },
  ];

  return (
    <ListGroup title={t("home.settings.downloads.downloads_title")}>
      <ListItem
        title={t("home.settings.downloads.local_transcoding_title")}
        subtitle={t("home.settings.downloads.local_transcoding_description")}
      >
        <Switch
          value={settings.localTranscodingEnabled}
          onValueChange={(value) =>
            updateSettings({ localTranscodingEnabled: value })
          }
        />
      </ListItem>

      {settings.localTranscodingEnabled && (
        <>
          <ListItem
            title={t("home.settings.downloads.local_transcoding_bitrate")}
          >
            <BitrateSelector
              selected={settings.localTranscodingBitrate}
              onChange={(value) =>
                updateSettings({ localTranscodingBitrate: value })
              }
            />
          </ListItem>
          <ListItem
            title={t("home.settings.downloads.local_transcoding_codec")}
          >
            <PlatformDropdown
              title={t("home.settings.downloads.local_transcoding_codec")}
              groups={codecOptions}
              trigger={
                <View className='bg-neutral-900 h-10 rounded-xl border-neutral-800 border px-3 py-2 flex flex-row items-center justify-between min-w-[120px]'>
                  <Text>
                    {settings.localTranscodingCodec === "libx264"
                      ? "H.264"
                      : "H.265"}
                  </Text>
                </View>
              }
              onOptionSelect={(val) => {
                if (val === "libx264" || val === "libx265") {
                  updateSettings({ localTranscodingCodec: val as any });
                }
              }}
            />
          </ListItem>
        </>
      )}
    </ListGroup>
  );
};

export default DownloadSettings;
