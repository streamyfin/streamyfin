import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/Controls";
import { getDownloadedFileUrl } from "@/hooks/useDownloadedFileOpener";
import { useOrientation } from "@/hooks/useOrientation";
import { useOrientationSettings } from "@/hooks/useOrientationSettings";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import native from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";
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
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

export default function page() {
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

  const { getDownloadedItem } = useDownload();

  const {
    itemId,
    audioIndex: audioIndexStr,
    subtitleIndex: subtitleIndexStr,
    mediaSourceId,
    bitrateValue: bitrateValueStr,
    offline: offlineStr,
  } = useLocalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
    offline: string;
  }>();

  const offline = offlineStr === "true";

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

      if (offline) {
        const item = await getDownloadedItem(itemId);
        if (item) return item.item;
      }

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

      if (offline) {
        const item = await getDownloadedItem(itemId);
        if (!item?.mediaSource) return null;

        const url = await getDownloadedFileUrl(item.item.Id!);

        if (item)
          return {
            mediaSource: item.mediaSource,
            url,
            sessionId: undefined,
          };
      }

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

      return {
        mediaSource,
        sessionId,
        url,
      };
    },
    enabled: !!itemId && !!api && !!item && !offline,
    staleTime: 0,
  });

  const togglePlay = useCallback(
    async (ms: number) => {
      if (!api || !stream) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (isPlaying) {
        await videoRef.current?.pause();

        if (!offline) {
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
        }

        console.log("Actually marked as paused");
      } else {
        videoRef.current?.play();
        if (!offline) {
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
      offline,
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

  const reportPlaybackStopped = useCallback(async () => {
    if (offline) return;
    const currentTimeInTicks = msToTicks(progress.value);
    await getPlaystateApi(api!).onPlaybackStopped({
      itemId: item?.Id!,
      mediaSourceId: mediaSourceId,
      positionTicks: currentTimeInTicks,
      playSessionId: stream?.sessionId!,
    });
  }, [api, item, mediaSourceId, stream]);

  const reportPlaybackStart = useCallback(async () => {
    if (!api || !stream) return;
    if (offline) return;
    await getPlaystateApi(api).onPlaybackStart({
      itemId: item?.Id!,
      audioStreamIndex: audioIndex ? audioIndex : undefined,
      subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      mediaSourceId: mediaSourceId,
      playMethod: stream.url?.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: stream?.sessionId ? stream?.sessionId : undefined,
    });
  }, [api, item, mediaSourceId, stream]);

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

      if (offline) return;

      const currentTimeInTicks = msToTicks(currentTime);

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
    offline: offline,
  });

  const onPlaybackStateChanged = useCallback((e: PlaybackStatePayload) => {
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
  }, []);

  const startPosition = useMemo(() => {
    if (offline) return 0;

    return item?.UserData?.PlaybackPositionTicks
      ? ticksToSeconds(item.UserData.PlaybackPositionTicks)
      : 0;
  }, [item]);

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

  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
      className="flex flex-col items-center justify-center"
    >
      <Pressable
        onPress={() => {
          // setShowControls(!showControls);
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
            initOptions: [
              "--sub-text-scale=60",
              `--sub-track=${subtitleIndex - 2}`, // This refers to the subtitle position index in the subtitles list.
              // `--audio-track=${audioIndex - 1}`, // This refers to the audio position index in the audio list.
            ],
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
          stop={stop}
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
