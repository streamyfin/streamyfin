import { VlcControls } from "@/components/video-player/VlcControls";
import { useAndroidNavigationBar } from "@/hooks/useAndroidNavigationBar";
import { useOrientation } from "@/hooks/useOrientation";
import { useOrientationSettings } from "@/hooks/useOrientationSettings";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  PlaybackType,
  usePlaySettings,
} from "@/providers/PlaySettingsProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { writeToLog } from "@/utils/log";
import { msToTicks, ticksToMs } from "@/utils/time";
import { Api } from "@jellyfin/sdk";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Dimensions, Pressable, StatusBar, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

export default function page() {
  const { playSettings, playUrl, playSessionId, mediaSource } =
    usePlaySettings();
  const api = useAtomValue(apiAtom);
  const videoRef = useRef<VlcPlayerViewRef>(null);
  // const poster = usePoster(playSettings, api);
  // const user = useAtomValue(userAtom);

  const router = useRouter();

  const screenDimensions = Dimensions.get("screen");

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

  if (!playSettings || !playUrl || !api || !playSettings.item || !mediaSource) {
    Alert.alert("Error", "Invalid play settings");
    router.back();
    return null;
  }

  const togglePlay = useCallback(
    async (ticks: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (isPlaying) {
        videoRef.current?.pause();
        await getPlaystateApi(api).onPlaybackProgress({
          itemId: playSettings.item?.Id!,
          audioStreamIndex: playSettings.audioIndex
            ? playSettings.audioIndex
            : undefined,
          subtitleStreamIndex: playSettings.subtitleIndex
            ? playSettings.subtitleIndex
            : undefined,
          mediaSourceId: playSettings.mediaSource?.Id!,
          positionTicks: Math.floor(ticks),
          isPaused: true,
          playMethod: playUrl.includes("m3u8") ? "Transcode" : "DirectStream",
          playSessionId: playSessionId ? playSessionId : undefined,
        });
      } else {
        videoRef.current?.play();
        await getPlaystateApi(api).onPlaybackProgress({
          itemId: playSettings.item?.Id!,
          audioStreamIndex: playSettings.audioIndex
            ? playSettings.audioIndex
            : undefined,
          subtitleStreamIndex: playSettings.subtitleIndex
            ? playSettings.subtitleIndex
            : undefined,
          mediaSourceId: playSettings.mediaSource?.Id!,
          positionTicks: Math.floor(ticks),
          isPaused: false,
          playMethod: playUrl.includes("m3u8") ? "Transcode" : "DirectStream",
          playSessionId: playSessionId ? playSessionId : undefined,
        });
      }
    },
    [isPlaying, api, playSettings?.item?.Id, videoRef]
  );

  const play = useCallback(() => {
    videoRef.current?.play();
    reportPlaybackStart();
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const stop = useCallback(() => {
    setIsPlaybackStopped(true);
    videoRef.current?.stop();
    reportPlaybackStopped();
  }, [videoRef]);

  const reportPlaybackStopped = async () => {
    await getPlaystateApi(api).onPlaybackStopped({
      itemId: playSettings?.item?.Id!,
      mediaSourceId: playSettings.mediaSource?.Id!,
      positionTicks: Math.floor(progress.value),
      playSessionId: playSessionId ? playSessionId : undefined,
    });
  };

  const reportPlaybackStart = async () => {
    await getPlaystateApi(api).onPlaybackStart({
      itemId: playSettings?.item?.Id!,
      audioStreamIndex: playSettings.audioIndex
        ? playSettings.audioIndex
        : undefined,
      subtitleStreamIndex: playSettings.subtitleIndex
        ? playSettings.subtitleIndex
        : undefined,
      mediaSourceId: playSettings.mediaSource?.Id!,
      playMethod: playUrl.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: playSessionId ? playSessionId : undefined,
    });
  };

  const onProgress = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.value === true) return;
      if (isPlaybackStopped === true) return;
      if (!playSettings.item?.Id) return;

      const { currentTime, isPlaying } = data.nativeEvent;

      progress.value = currentTime;
      const currentTimeInTicks = msToTicks(currentTime);

      await getPlaystateApi(api).onPlaybackProgress({
        itemId: playSettings.item.Id,
        audioStreamIndex: playSettings.audioIndex
          ? playSettings.audioIndex
          : undefined,
        subtitleStreamIndex: playSettings.subtitleIndex
          ? playSettings.subtitleIndex
          : undefined,
        mediaSourceId: playSettings.mediaSource?.Id!,
        positionTicks: Math.floor(currentTimeInTicks),
        isPaused: !isPlaying,
        playMethod: playUrl.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: playSessionId ? playSessionId : undefined,
      });
    },
    [playSettings?.item.Id, isPlaying, api, isPlaybackStopped]
  );

  useFocusEffect(
    useCallback(() => {
      play();

      return () => {
        stop();
      };
    }, [play, stop])
  );

  useOrientation();
  useOrientationSettings();
  useAndroidNavigationBar();

  useWebSocket({
    isPlaying: isPlaying,
    pauseVideo: pause,
    playVideo: play,
    stopPlayback: stop,
  });

  const onPlaybackStateChanged = (e: PlaybackStatePayload) => {
    const { state, isBuffering, isPlaying } = e.nativeEvent;

    if (state === "Playing") {
      setIsPlaying(true);
      return;
    }

    if (state === "Paused") {
      setIsPlaying(false);
      return;
    }

    if (isPlaying) {
      setIsPlaying(true);
      setIsBuffering(false);
    } else if (isBuffering) {
      setIsBuffering(true);
    }
  };

  useEffect(() => {
    console.log(
      "PlaybackPositionTicks",
      playSettings.item?.UserData?.PlaybackPositionTicks
    );
  }, [playSettings.item]);

  return (
    <View
      style={{
        width: screenDimensions.width,
        height: screenDimensions.height,
        position: "relative",
      }}
      className="flex flex-col items-center justify-center"
    >
      <StatusBar hidden />
      <Pressable
        onPress={() => {
          setShowControls(!showControls);
        }}
        className="absolute z-0 h-full w-full"
      >
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: playUrl,
            autoplay: true,
            isNetwork: true,
            startPosition: ticksToMs(
              playSettings.item.UserData?.PlaybackPositionTicks
            ),
          }}
          style={{ width: "100%", height: "100%" }}
          onVideoProgress={onProgress}
          progressUpdateInterval={1000}
          onVideoStateChange={onPlaybackStateChanged}
          onVideoLoadStart={() => {}}
          onVideoLoadEnd={() => {
            setIsVideoLoaded(true);
          }}
          onVideoError={(e) => {
            console.error("Video Error:", e.nativeEvent);
            Alert.alert(
              "Error",
              "An error occurred while playing the video. Check logs in settings."
            );
            writeToLog("ERROR", "Video Error", e.nativeEvent);
          }}
        />
      </Pressable>

      {videoRef.current && (
        <VlcControls
          mediaSource={mediaSource}
          item={playSettings.item}
          videoRef={videoRef}
          togglePlay={togglePlay}
          isPlaying={isPlaying}
          isSeeking={isSeeking}
          progress={progress}
          cacheProgress={cacheProgress}
          isBuffering={isBuffering}
          showControls={showControls}
          setShowControls={setShowControls}
          setIgnoreSafeAreas={setIgnoreSafeAreas}
          ignoreSafeAreas={ignoreSafeAreas}
          isVideoLoaded={isVideoLoaded}
          play={videoRef.current?.play}
          pause={videoRef.current?.pause}
          seek={videoRef.current?.seekTo}
          enableTrickplay={true}
          getAudioTracks={videoRef.current?.getAudioTracks}
          getSubtitleTracks={videoRef.current?.getSubtitleTracks}
          offline={false}
          setSubtitleTrack={videoRef.current.setSubtitleTrack}
          setSubtitleURL={videoRef.current.setSubtitleURL}
          setAudioTrack={videoRef.current.setAudioTrack}
          stop={videoRef.current.stop}
        />
      )}
    </View>
  );
}

export function usePoster(
  playSettings: PlaybackType | null,
  api: Api | null
): string | undefined {
  const poster = useMemo(() => {
    if (!playSettings?.item || !api) return undefined;
    return playSettings.item.Type === "Audio"
      ? `${api.basePath}/Items/${playSettings.item.AlbumId}/Images/Primary?tag=${playSettings.item.AlbumPrimaryImageTag}&quality=90&maxHeight=200&maxWidth=200`
      : getBackdropUrl({
          api,
          item: playSettings.item,
          quality: 70,
          width: 200,
        });
  }, [playSettings?.item, api]);

  return poster ?? undefined;
}
