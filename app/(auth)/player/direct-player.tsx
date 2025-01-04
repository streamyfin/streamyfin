import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
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
import { useFocusEffect, useGlobalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Platform, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

export default function page() {
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

  const revalidateProgressCache = useInvalidatePlaybackProgressCache();

  const setShowControls = useCallback((show: boolean) => {
    _setShowControls(show);
  }, []);

  const {
    itemId,
    audioIndex: audioIndexStr,
    subtitleIndex: subtitleIndexStr,
    mediaSourceId,
    bitrateValue: bitrateValueStr,
  } = useGlobalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
  }>();
  const [settings] = useSettings();

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
      const res = await getUserLibraryApi(api!).getItem({
        itemId,
        userId: user?.Id,
      });

      return res.data;
    },
    enabled: !!itemId,
    staleTime: 0,
  });

  const {
    data: stream,
    isLoading: isLoadingStreamUrl,
    isError: isErrorStreamUrl,
  } = useQuery({
    queryKey: ["stream-url", itemId, mediaSourceId, bitrateValue],
    queryFn: async () => {
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

      if (!sessionId || !mediaSource || !url) {
        Alert.alert("Error", "Failed to get stream url");
        return null;
      }

      return {
        mediaSource,
        sessionId,
        url,
      };
    },
    enabled: !!itemId && !!item,
    staleTime: 0,
  });

  const togglePlay = useCallback(async () => {
    if (!api) return;

    if (isPlaying) {
      await videoRef.current?.pause();

      if (stream) {
        await getPlaystateApi(api).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: msToTicks(progress.value),
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
      if (stream) {
        await getPlaystateApi(api).onPlaybackProgress({
          itemId: item?.Id!,
          audioStreamIndex: audioIndex ? audioIndex : undefined,
          subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
          mediaSourceId: mediaSourceId,
          positionTicks: msToTicks(progress.value),
          isPaused: false,
          playMethod: stream?.url.includes("m3u8")
            ? "Transcode"
            : "DirectStream",
          playSessionId: stream.sessionId,
        });
      }
    }
  }, [
    isPlaying,
    api,
    item,
    stream,
    videoRef,
    audioIndex,
    subtitleIndex,
    mediaSourceId,
    progress.value,
  ]);

  const reportPlaybackStopped = useCallback(async () => {
    const currentTimeInTicks = msToTicks(progress.value);

    await getPlaystateApi(api!).onPlaybackStopped({
      itemId: item?.Id!,
      mediaSourceId: mediaSourceId,
      positionTicks: currentTimeInTicks,
      playSessionId: stream?.sessionId!,
    });

    revalidateProgressCache();
  }, [api, item, mediaSourceId, stream]);

  const stop = useCallback(() => {
    reportPlaybackStopped();
    setIsPlaybackStopped(true);
    videoRef.current?.stop();
  }, [videoRef, reportPlaybackStopped]);

  // TODO: unused should remove.
  const reportPlaybackStart = useCallback(async () => {
    if (!stream) return;
    await getPlaystateApi(api!).onPlaybackStart({
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

      const { currentTime } = data.nativeEvent;

      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.value = currentTime;

      const currentTimeInTicks = msToTicks(currentTime);

      if (!item?.Id || !stream) return;

      await getPlaystateApi(api!).onPlaybackProgress({
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
    [item?.Id, isPlaying, api, isPlaybackStopped, audioIndex, subtitleIndex]
  );

  useWebSocket({
    isPlaying: isPlaying,
    togglePlay: togglePlay,
    stopPlayback: stop,
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
    return item?.UserData?.PlaybackPositionTicks
      ? ticksToSeconds(item.UserData.PlaybackPositionTicks)
      : 0;
  }, [item]);

  useFocusEffect(
    React.useCallback(() => {
      return async () => {
        stop();
        console.log("Unmounted");
      };
    }, [])
  );

  if (!settings) return null;

  let initOptions = [`--sub-text-scale=${settings.subtitleSize}`];
  let externalTrack = { name: "", DeliveryUrl: "" };

  const allSubs =
    stream?.mediaSource.MediaStreams?.filter(
      (sub) => sub.Type === "Subtitle"
    ) || [];
  const chosenSubtitleTrack = allSubs.find(
    (sub) => sub.Index === subtitleIndex
  );
  const allAudio =
    stream?.mediaSource.MediaStreams?.filter(
      (audio) => audio.Type === "Audio"
    ) || [];
  const chosenAudioTrack = allAudio.find((audio) => audio.Index === audioIndex);

  // Direct playback CASE
  if (!bitrateValue) {
    // If Subtitle is embedded we can use the position to select it straight away.
    if (chosenSubtitleTrack && !chosenSubtitleTrack.DeliveryUrl) {
      initOptions.push(`--sub-track=${allSubs.indexOf(chosenSubtitleTrack)}`);
    } else if (chosenSubtitleTrack && chosenSubtitleTrack.DeliveryUrl) {
      // If Subtitle is external we need to pass the URL to the player.
      externalTrack = {
        name: chosenSubtitleTrack.DisplayTitle || "",
        DeliveryUrl: `${api?.basePath || ""}${chosenSubtitleTrack.DeliveryUrl}`,
      };
    }

    if (chosenAudioTrack)
      initOptions.push(`--audio-track=${allAudio.indexOf(chosenAudioTrack)}`);
  } else {
    // Transcoded playback CASE
    if (chosenSubtitleTrack?.DeliveryMethod === "Hls") {
      externalTrack = {
        name: `subs ${chosenSubtitleTrack.DisplayTitle}`,
        DeliveryUrl: "",
      };
    }
  }

  if (!item || isLoadingItem || isLoadingStreamUrl || !stream)
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

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <View
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          flexDirection: "column",
          justifyContent: "center",
          opacity: showControls ? (Platform.OS === "android" ? 0.7 : 0.5) : 1,
        }}
      >
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: stream.url,
            autoplay: true,
            isNetwork: true,
            startPosition,
            externalTrack,
            initOptions,
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
      </View>
      {videoRef.current && (
        <Controls
          mediaSource={stream?.mediaSource}
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
