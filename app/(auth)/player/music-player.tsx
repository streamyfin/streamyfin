import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { useWebSocket } from "@/hooks/useWebsockets";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { secondsToTicks } from "@/utils/secondsToTicks";
import { Api } from "@jellyfin/sdk";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Video, { OnProgressData, VideoRef } from "react-native-video";

export default function page() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const [settings] = useSettings();
  const videoRef = useRef<VideoRef | null>(null);
  const windowDimensions = useWindowDimensions();

  const firstTime = useRef(true);

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

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
  const subtitleIndex = subtitleIndexStr
    ? parseInt(subtitleIndexStr, 10)
    : undefined;
  const bitrateValue = bitrateValueStr
    ? parseInt(bitrateValueStr, 10)
    : undefined;

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
    queryKey: ["stream-url"],
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
  });

  const poster = usePoster(item, api);
  const videoSource = useVideoSource(item, api, poster, stream?.url);

  const togglePlay = useCallback(
    async (ticks: number) => {
      if (isPlaying) {
        videoRef.current?.pause();
        await getPlaystateApi(api!).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: Math.floor(ticks),
          isPaused: true,
          playMethod: stream?.url.includes("m3u8")
            ? "Transcode"
            : "DirectStream",
          playSessionId: stream?.sessionId,
        });
      } else {
        videoRef.current?.resume();
        await getPlaystateApi(api!).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: Math.floor(ticks),
          isPaused: false,
          playMethod: stream?.url.includes("m3u8")
            ? "Transcode"
            : "DirectStream",
          playSessionId: stream?.sessionId,
        });
      }
    },
    [
      isPlaying,
      api,
      item,
      videoRef,
      settings,
      audioIndex,
      subtitleIndex,
      mediaSourceId,
      stream,
    ]
  );

  const play = useCallback(() => {
    console.log("play");
    videoRef.current?.resume();
    reportPlaybackStart();
  }, [videoRef]);

  const pause = useCallback(() => {
    console.log("play");
    videoRef.current?.pause();
  }, [videoRef]);

  const stop = useCallback(() => {
    console.log("stop");
    setIsPlaybackStopped(true);
    videoRef.current?.pause();
    reportPlaybackStopped();
  }, [videoRef]);

  const seek = useCallback(
    (seconds: number) => {
      videoRef.current?.seek(seconds);
    },
    [videoRef]
  );

  const reportPlaybackStopped = async () => {
    if (!item?.Id) return;
    await getPlaystateApi(api!).onPlaybackStopped({
      itemId: item.Id,
      mediaSourceId: mediaSourceId,
      positionTicks: Math.floor(progress.value),
      playSessionId: stream?.sessionId,
    });
  };

  const reportPlaybackStart = async () => {
    if (!item?.Id) return;
    await getPlaystateApi(api!).onPlaybackStart({
      itemId: item?.Id,
      audioStreamIndex: audioIndex ? audioIndex : undefined,
      subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      mediaSourceId: mediaSourceId,
      playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: stream?.sessionId,
    });
  };

  const onProgress = useCallback(
    async (data: OnProgressData) => {
      if (isSeeking.value === true) return;
      if (isPlaybackStopped === true) return;

      const ticks = data.currentTime * 10000000;

      progress.value = secondsToTicks(data.currentTime);
      cacheProgress.value = secondsToTicks(data.playableDuration);
      setIsBuffering(data.playableDuration === 0);

      if (!item?.Id || data.currentTime === 0) return;

      await getPlaystateApi(api!).onPlaybackProgress({
        itemId: item.Id!,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: Math.round(ticks),
        isPaused: !isPlaying,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream?.sessionId,
      });
    },
    [
      item,
      isPlaying,
      api,
      isPlaybackStopped,
      audioIndex,
      subtitleIndex,
      mediaSourceId,
      stream,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      play();

      return () => {
        stop();
      };
    }, [play, stop])
  );

  useWebSocket({
    isPlaying: isPlaying,
    pauseVideo: pause,
    playVideo: play,
    stopPlayback: stop,
  });

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

  if (!item || !stream)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Text className="text-white">Error</Text>
      </View>
    );

  return (
    <View
      style={{
        width: windowDimensions.width,
        height: windowDimensions.height,
        position: "relative",
      }}
      className="flex flex-col items-center justify-center"
    >
      <View className="h-screen w-screen top-0 left-0 flex flex-col items-center justify-center p-4 absolute z-0">
        <Image
          source={poster}
          style={{ width: "100%", height: "100%", resizeMode: "contain" }}
        />
      </View>

      <Pressable
        onPress={() => {
          setShowControls(!showControls);
        }}
        className="absolute z-0 h-full w-full opacity-0"
      >
        {videoSource && (
          <Video
            ref={videoRef}
            source={videoSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode={ignoreSafeAreas ? "cover" : "contain"}
            onProgress={onProgress}
            onError={() => {}}
            onLoad={() => {
              if (firstTime.current === true) {
                play();
                firstTime.current = false;
              }
            }}
            progressUpdateInterval={500}
            playWhenInactive={true}
            allowsExternalPlayback={true}
            playInBackground={true}
            pictureInPicture={true}
            showNotificationControls={true}
            ignoreSilentSwitch="ignore"
            fullscreen={false}
            onPlaybackStateChanged={(state) => {
              setIsPlaying(state.isPlaying);
            }}
          />
        )}
      </Pressable>

      <Controls
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
        enableTrickplay={false}
        pause={pause}
        play={play}
        seek={seek}
        isVlc={false}
        stop={stop}
      />
    </View>
  );
}

export function usePoster(
  item: BaseItemDto | null | undefined,
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

export function useVideoSource(
  item: BaseItemDto | null | undefined,
  api: Api | null,
  poster: string | undefined,
  url?: string | null
) {
  const videoSource = useMemo(() => {
    if (!item || !api || !url) {
      return null;
    }

    const startPosition = item?.UserData?.PlaybackPositionTicks
      ? Math.round(item.UserData.PlaybackPositionTicks / 10000)
      : 0;

    return {
      uri: url,
      isNetwork: true,
      startPosition,
      headers: getAuthHeaders(api),
      metadata: {
        artist: item?.AlbumArtist ?? undefined,
        title: item?.Name || "Unknown",
        description: item?.Overview ?? undefined,
        imageUri: poster,
        subtitle: item?.Album ?? undefined,
      },
    };
  }, [item, api, poster]);

  return videoSource;
}
