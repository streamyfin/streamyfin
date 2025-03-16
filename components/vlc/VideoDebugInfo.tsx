import type { TrackInfo, VlcPlayerViewRef } from "@/modules/VlcPlayer.types";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  playerRef: React.RefObject<VlcPlayerViewRef>;
}

export const VideoDebugInfo: React.FC<Props> = ({ playerRef, ...props }) => {
  const [audioTracks, setAudioTracks] = useState<TrackInfo[] | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[] | null>(
    null,
  );

  useEffect(() => {
    const fetchTracks = async () => {
      if (playerRef.current) {
        const audio = await playerRef.current.getAudioTracks();
        const subtitles = await playerRef.current.getSubtitleTracks();
        setAudioTracks(audio);
        setSubtitleTracks(subtitles);
      }
    };

    fetchTracks();
  }, [playerRef]);

  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  return (
    <View
      style={{
        position: "absolute",
        top: insets.top,
        left: insets.left + 8,
        zIndex: 100,
      }}
      {...props}
    >
      <Text className='font-bold'>{t("player.playback_state")}</Text>
      <Text className='font-bold mt-2.5'>{t("player.audio_tracks")}</Text>
      {audioTracks?.map((track, index) => (
        <Text key={index}>
          {track.name} ({t("player.index")} {track.index})
        </Text>
      ))}
      <Text className='font-bold mt-2.5'>{t("player.subtitles_tracks")}</Text>
      {subtitleTracks?.map((track, index) => (
        <Text key={index}>
          {track.name} ({t("player.index")} {track.index})
        </Text>
      ))}
      <TouchableOpacity
        className='mt-2.5 bg-blue-500 p-2 rounded'
        onPress={() => {
          if (playerRef.current) {
            playerRef.current.getAudioTracks().then(setAudioTracks);
            playerRef.current.getSubtitleTracks().then(setSubtitleTracks);
          }
        }}
      >
        <Text className='text-white text-center'>
          {t("player.refresh_tracks")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
