import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
  TrackInfo,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { useState, useEffect } from "react";
import { View, TouchableOpacity, ViewProps } from "react-native";
import { Text } from "../common/Text";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
      <Text className="font-bold">Playback State:</Text>
      <Text className="font-bold mt-2.5">Audio Tracks:</Text>
      {audioTracks &&
        audioTracks.map((track, index) => (
          <Text key={index}>
            {track.name} (Index: {track.index})
          </Text>
        ))}
      <Text className="font-bold mt-2.5">Subtitle Tracks:</Text>
      {subtitleTracks &&
        subtitleTracks.map((track, index) => (
          <Text key={index}>
            {track.name} (Index: {track.index})
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
        <Text className="text-white text-center">Refresh Tracks</Text>
      </TouchableOpacity>
    </View>
  );
};
