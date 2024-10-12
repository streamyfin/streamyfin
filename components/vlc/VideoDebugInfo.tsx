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

interface Props extends ViewProps {
  playbackState: PlaybackStatePayload["nativeEvent"] | null;
  progress: ProgressUpdatePayload["nativeEvent"] | null;
  playerRef: React.RefObject<VlcPlayerViewRef>;
}

export const VideoDebugInfo: React.FC<Props> = ({
  playbackState,
  progress,
  playerRef,
  ...props
}) => {
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

  return (
    <View className="p-2.5 bg-black mt-2.5" {...props}>
      <Text className="font-bold">Playback State:</Text>
      {playbackState && (
        <>
          <Text>Type: {playbackState.type}</Text>
          <Text>Current Time: {playbackState.currentTime}</Text>
          <Text>Duration: {playbackState.duration}</Text>
          <Text>Is Buffering: {playbackState.isBuffering ? "Yes" : "No"}</Text>
          <Text>Target: {playbackState.target}</Text>
        </>
      )}
      <Text className="font-bold mt-2.5">Progress:</Text>
      {progress && (
        <>
          <Text>Current Time: {progress.currentTime}</Text>
          <Text>Duration: {progress.duration.toFixed(2)}</Text>
        </>
      )}
      <Text className="font-bold mt-2.5">Audio Tracks:</Text>
      {audioTracks &&
        audioTracks.map((track) => (
          <Text key={track.index}>
            {track.name} (Index: {track.index})
          </Text>
        ))}
      <Text className="font-bold mt-2.5">Subtitle Tracks:</Text>
      {subtitleTracks &&
        subtitleTracks.map((track) => (
          <Text key={track.index}>
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
