import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  getActiveVideoPlayer,
  isNativePlayerSupported,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const PLAYER_OPTIONS: { key: string; value: VideoPlayer }[] = [
  { key: "home.settings.video_player.native", value: VideoPlayer.Native },
  { key: "home.settings.video_player.mpv", value: VideoPlayer.MPV },
];

/**
 * Lets iPhone users choose between the fully-native iOS player (the
 * default) and the MPV-based player. Renders nothing on platforms where
 * the native player doesn't ship.
 */
export const VideoPlayerSelector: React.FC<ViewProps> = ({ ...props }) => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  // Display the EFFECTIVE choice: an unset preference resolves to Native
  // on iPhone, so the row never shows a stale "MPV" for users who never
  // picked anything.
  const activePlayer = getActiveVideoPlayer(settings);

  const playerOptionGroups = useMemo(
    () => [
      {
        options: PLAYER_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: t(option.key),
          value: option.value,
          selected: option.value === activePlayer,
          onPress: () => updateSettings({ videoPlayer: option.value }),
        })),
      },
    ],
    [activePlayer, t, updateSettings],
  );

  const currentPlayerLabel = useMemo(() => {
    const option = PLAYER_OPTIONS.find((o) => o.value === activePlayer);
    return option ? t(option.key) : t("home.settings.video_player.mpv");
  }, [activePlayer, t]);

  if (!isNativePlayerSupported) return null;

  if (!settings) return null;

  return (
    <ListGroup
      title={t("home.settings.video_player.title")}
      description={
        <Text className='text-[#8E8D91] text-xs'>
          {t("home.settings.video_player.native_note")}
        </Text>
      }
      {...props}
    >
      <ListItem title={t("home.settings.video_player.title")}>
        <PlatformDropdown
          groups={playerOptionGroups}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>{currentPlayerLabel}</Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
          title={t("home.settings.video_player.title")}
        />
      </ListItem>
    </ListGroup>
  );
};
