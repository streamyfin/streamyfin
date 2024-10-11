import { Text } from "@/components/common/Text";
import { TAB_HEIGHT } from "@/constants/Values";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import React, { useEffect, useRef, useState } from "react";
import { Button, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function index() {
  const insets = useSafeAreaInsets();
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const [playbackState, setPlaybackState] = useState<
    PlaybackStatePayload["nativeEvent"] | null
  >(null);
  const [progress, setProgress] = useState<
    ProgressUpdatePayload["nativeEvent"] | null
  >(null);

  useEffect(() => {
    videoRef.current?.play();
  }, []);

  const onProgress = (event: ProgressUpdatePayload) => {
    const { currentTime, duration } = event.nativeEvent;
    console.log(`Current Time: ${currentTime}, Duration: ${duration}`);
    setProgress(event.nativeEvent);
  };

  const onPlaybackStateChanged = (event: PlaybackStatePayload) => {
    const { isBuffering, currentTime, duration, target, type } =
      event.nativeEvent;
    console.log("onVideoStateChange", {
      isBuffering,
      currentTime,
      duration,
      target,
      type,
    });
    setPlaybackState(event.nativeEvent);
  };

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      key={"home"}
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
      style={{
        marginBottom: TAB_HEIGHT,
      }}
    >
      <View className="flex flex-col space-y-4">
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
            autoplay: true,
            isNetwork: true,
          }}
          style={{ width: "100%", height: 300 }}
          onVideoProgress={onProgress}
          progressUpdateInterval={2000}
          onVideoStateChange={onPlaybackStateChanged}
        />
        <VideoDebugInfo
          playbackState={playbackState}
          progress={progress}
          playerRef={videoRef}
        />
      </View>
      <Button
        title="pause"
        onPress={() => {
          videoRef.current?.pause();
        }}
      />
      <Button
        title="play"
        onPress={() => {
          videoRef.current?.play();
        }}
      />
      <Button
        title="seek to 10 seconds"
        onPress={() => {
          videoRef.current?.seekTo(10);
        }}
      />
    </ScrollView>
  );
}

const VideoDebugInfo: React.FC<{
  playbackState: PlaybackStatePayload["nativeEvent"] | null;
  progress: ProgressUpdatePayload["nativeEvent"] | null;
  playerRef: React.RefObject<VlcPlayerViewRef>;
}> = ({ playbackState, progress, playerRef }) => {
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
    <View className="p-2.5 bg-black mt-2.5">
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
