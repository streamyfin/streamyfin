import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/Controls";
import { useOrientation } from "@/hooks/useOrientation";
import { useOrientationSettings } from "@/hooks/useOrientationSettings";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import native from "@/utils/profiles/native";
import { msToTicks, ticksToMs } from "@/utils/time";
import { Api } from "@jellyfin/sdk";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { useSharedValue } from "react-native-reanimated";

export default function page() {
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const windowDimensions = useWindowDimensions();

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

  const {
    itemId,
    audioIndex: audioIndexStr,
    subtitleIndex: subtitleIndexStr,
    mediaSourceId,
    bitrateValue: bitrateValueStr,
  } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();

  const audioIndex = audioIndexStr ? parseInt(audioIndexStr, 10) : undefined;
  const subtitleIndex = subtitleIndexStr ? parseInt(subtitleIndexStr, 10) : -1;
  const bitrateValue = bitrateValueStr
    ? parseInt(bitrateValueStr, 10)
    : BITRATES[0].value;

  const {
    data: item,
    isLoading: isLoadingItem,
    isError: isErrorItem,
  } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      if (!api) return;
      const res = await getUserLibraryApi(api).getItem({
        itemId,
        userId: user?.Id,
      });

      return res.data;
    },
    enabled: !!itemId && !!api,
    staleTime: 0,
  });

  const {
    data: stream,
    isLoading: isLoadingStreamUrl,
    isError: isErrorStreamUrl,
  } = useQuery({
    queryKey: [
      "stream-url",
      itemId,
      audioIndex,
      subtitleIndex,
      mediaSourceId,
      bitrateValue,
    ],
    queryFn: async () => {
      if (!api) return;
      const res = await getStreamUrl({
        api,
        item,
        startTimeTicks: item?.UserData?.PlaybackPositionTicks!,
        userId: user?.Id,
        audioStreamIndex: audioIndex,
        maxStreamingBitrate: bitrateValue,
        mediaSourceId: mediaSourceId,
        subtitleStreamIndex: subtitleIndex,
        deviceProfile: native,
      });

      if (!res) return null;

      const { mediaSource, sessionId, url } = res;

      if (!sessionId || !mediaSource || !url) return null;

      console.log(url);

      return {
        mediaSource,
        sessionId,
        url,
      };
    },
    enabled: !!itemId && !!api && !!item,
    staleTime: 0,
  });

  const togglePlay = useCallback(
    async (ms: number) => {
      if (!api || !stream) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (isPlaying) {
        await videoRef.current?.pause();

        await getPlaystateApi(api).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: msToTicks(ms),
          isPaused: true,
          playMethod: stream.url?.includes("m3u8")
            ? "Transcode"
            : "DirectStream",
          playSessionId: stream.sessionId,
        });
        console.log("ACtually marked as paused");
      } else {
        videoRef.current?.play();
        await getPlaystateApi(api).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: msToTicks(ms),
          isPaused: false,
          playMethod: stream?.url.includes("m3u8")
            ? "Transcode"
            : "DirectStream",
          playSessionId: stream.sessionId,
        });
      }
    },
    [
      isPlaying,
      api,
      item,
      stream,
      videoRef,
      audioIndex,
      subtitleIndex,
      mediaSourceId,
    ]
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
    if (!api) return;
    await getPlaystateApi(api).onPlaybackStopped({
      itemId: item?.Id!,
      mediaSourceId: mediaSourceId,
      positionTicks: Math.floor(progress.value),
      playSessionId: stream?.sessionId!,
    });
  };

  const reportPlaybackStart = async () => {
    if (!api || !stream) return;
    await getPlaystateApi(api).onPlaybackStart({
      itemId: item?.Id!,
      audioStreamIndex: audioIndex ? audioIndex : undefined,
      subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      mediaSourceId: mediaSourceId,
      playMethod: stream.url?.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: stream?.sessionId ? stream?.sessionId : undefined,
    });
  };

  const onProgress = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.value === true) return;
      if (isPlaybackStopped === true) return;
      if (!item?.Id || !api || !stream) return;

      const { currentTime } = data.nativeEvent;

      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.value = currentTime;
      const currentTimeInTicks = msToTicks(currentTime);

      // console.log("onProgress ~", {
      //   currentTime,
      //   currentTimeInTicks,
      //   isPlaying,
      // });

      await getPlaystateApi(api).onPlaybackProgress({
        itemId: item.Id,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: Math.floor(currentTimeInTicks),
        isPaused: !isPlaying,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream.sessionId,
      });
    },
    [item?.Id, isPlaying, api, isPlaybackStopped]
  );

  useOrientation();
  useOrientationSettings();

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

  if (isLoadingItem || isLoadingStreamUrl)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Loader />
      </View>
    );

  if (isErrorItem || isErrorStreamUrl)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Text className="text-white">Error</Text>
      </View>
    );

  if (!stream || !item) return null;

  const startPosition = item?.UserData?.PlaybackPositionTicks
    ? ticksToMs(item.UserData.PlaybackPositionTicks)
    : 0;

  return (
    <View
      style={{
        width: windowDimensions.width,
        height: windowDimensions.height,
        position: "relative",
      }}
      className="flex flex-col items-center justify-center"
    >
      <SystemBars hidden />
      <Pressable
        onPress={() => {
          setShowControls(!showControls);
        }}
        className="absolute z-0 h-full w-full"
      >
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: stream.url,
            autoplay: true,
            isNetwork: true,
            startPosition,
            initOptions: ["--sub-text-scale=60"],
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
        <Controls
          mediaSource={stream.mediaSource}
          item={item}
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
          stop={videoRef.current?.stop}
          isVlc
        />
      )}
    </View>
  );
}

export function usePoster(
  item: BaseItemDto,
  api: Api | null
): string | undefined {
  const poster = useMemo(() => {
    if (!item || !api) return undefined;
    return item.Type === "Audio"
      ? `${api.basePath}/Items/${item.AlbumId}/Images/Primary?tag=${item.AlbumPrimaryImageTag}&quality=90&maxHeight=200&maxWidth=200`
      : getBackdropUrl({
          api,
          item: item,
          quality: 70,
          width: 200,
        });
  }, [item, api]);

  return poster ?? undefined;
}
