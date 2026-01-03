import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Switch, View } from "react-native";
import { setHardwareDecode } from "@/modules/sf-player";
import { useSettings, VideoPlayerIOS } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

export const VideoPlayerSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const handleHardwareDecodeChange = useCallback(
    (value: boolean) => {
      updateSettings({ ksHardwareDecode: value });
      setHardwareDecode(value);
    },
    [updateSettings],
  );

  const videoPlayerOptions = useMemo(
    () => [
      {
        options: [
          {
            type: "radio" as const,
            label: t("home.settings.video_player.ksplayer"),
            value: VideoPlayerIOS.KSPlayer,
            selected: settings?.videoPlayerIOS === VideoPlayerIOS.KSPlayer,
            onPress: () =>
              updateSettings({ videoPlayerIOS: VideoPlayerIOS.KSPlayer }),
          },
          {
            type: "radio" as const,
            label: t("home.settings.video_player.vlc"),
            value: VideoPlayerIOS.VLC,
            selected: settings?.videoPlayerIOS === VideoPlayerIOS.VLC,
            onPress: () =>
              updateSettings({ videoPlayerIOS: VideoPlayerIOS.VLC }),
          },
        ],
      },
    ],
    [settings?.videoPlayerIOS, t, updateSettings],
  );

  const getPlayerLabel = useCallback(() => {
    switch (settings?.videoPlayerIOS) {
      case VideoPlayerIOS.VLC:
        return t("home.settings.video_player.vlc");
      default:
        return t("home.settings.video_player.ksplayer");
    }
  }, [settings?.videoPlayerIOS, t]);

  if (Platform.OS !== "ios" || !settings) return null;

  return (
    <ListGroup title={t("home.settings.video_player.title")} className='mt-4'>
      <ListItem
        title={t("home.settings.video_player.video_player")}
        subtitle={t("home.settings.video_player.video_player_description")}
      >
        <PlatformDropdown
          groups={videoPlayerOptions}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>{getPlayerLabel()}</Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
          title={t("home.settings.video_player.video_player")}
        />
      </ListItem>

      {settings.videoPlayerIOS === VideoPlayerIOS.KSPlayer && (
        <ListItem
          title={t("home.settings.subtitles.hardware_decode")}
          subtitle={t("home.settings.subtitles.hardware_decode_description")}
        >
          <Switch
            value={settings.ksHardwareDecode}
            onValueChange={handleHardwareDecodeChange}
          />
        </ListItem>
      )}
    </ListGroup>
  );
};
