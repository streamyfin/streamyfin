import {
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import React, { useEffect, useState } from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../common/Text";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {
  playerRef: React.RefObject<VlcPlayerViewRef>;
}

export const VideoDebugInfo: React.FC<Props> = ({ playerRef, ...props }) => {
  const [audioTracks, setAudioTracks] = useState<TrackInfo[] | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[] | null>(
    null
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
      <Text className="font-bold">{t("item_card.playback_state")}</Text>
      <Text className="font-bold mt-2.5">{t("item_card.audio_tracks")}</Text>
      {audioTracks &&
        audioTracks.map((track, index) => (
          <Text key={index}>
            {track.name} ({t("item_card.index")} {track.index})
          </Text>
        ))}
      <Text className="font-bold mt-2.5">{t("item_card.subtitles_tracks")}</Text>
      {subtitleTracks &&
        subtitleTracks.map((track, index) => (
          <Text key={index}>
            {track.name} ({t("item_card.index")} {track.index})
          </Text>
        ))}
      <TouchableOpacity
        className="mt-2.5 bg-blue-500 p-2 rounded"
        onPress={() => {
          if (playerRef.current) {
            playerRef.current.getAudioTracks().then(setAudioTracks);
            playerRef.current.getSubtitleTracks().then(setSubtitleTracks);
          }
        }}
      >
        <Text className="text-white text-center">{t("item_card.refresh_tracks")}</Text>
      </TouchableOpacity>
    </View>
  );
};
