import { Controls } from "@/components/video-player/Controls";
import { VideoDebugInfo } from "@/components/vlc/VideoDebugInfo";
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
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { ticksToSeconds } from "@/utils/time";
import { Api } from "@jellyfin/sdk";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useAtomValue } from "jotai";
import { set } from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Dimensions, Pressable, StatusBar, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Video, {
  OnProgressData,
  SelectedTrackType,
  VideoRef,
} from "react-native-video";

export default function page() {
  const { playSettings, playUrl, playSessionId } = usePlaySettings();
  const api = useAtomValue(apiAtom);
  const [settings] = useSettings();
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const poster = usePoster(playSettings, api);
  const videoSource = useVideoSource(playSettings, api, poster, playUrl);
  const firstTime = useRef(true);

  const screenDimensions = Dimensions.get("screen");

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

  const [playbackState, setPlaybackState] = useState<
    PlaybackStatePayload["nativeEvent"] | null
  >(null);

  if (!playSettings || !playUrl || !api || !videoSource || !playSettings.item)
    return null;

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
    [isPlaying, api, playSettings?.item?.Id, videoRef, settings]
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

      const { currentTime, duration, isBuffering, isPlaying } =
        data.nativeEvent;

      setIsBuffering(isBuffering);

      // console.log("onProgress ~", {
      //   currentTime,
      //   duration,
      //   isBuffering,
      //   isPlaying,
      // });

      progress.value = currentTime;

      // cacheProgress.value = secondsToTicks(data.playableDuration);
      // setIsBuffering(data.playableDuration === 0);

      // if (!playSettings?.item?.Id || data.currentTime === 0) return;

      // await getPlaystateApi(api).onPlaybackProgress({
      //   itemId: playSettings.item.Id,
      //   audioStreamIndex: playSettings.audioIndex
      //     ? playSettings.audioIndex
      //     : undefined,
      //   subtitleStreamIndex: playSettings.subtitleIndex
      //     ? playSettings.subtitleIndex
      //     : undefined,
      //   mediaSourceId: playSettings.mediaSource?.Id!,
      //   positionTicks: Math.round(ticks),
      //   isPaused: !isPlaying,
      //   playMethod: playUrl.includes("m3u8") ? "Transcode" : "DirectStream",
      //   playSessionId: playSessionId ? playSessionId : undefined,
      // });
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

  const { orientation } = useOrientation();
  useOrientationSettings();
  useAndroidNavigationBar();

  useWebSocket({
    isPlaying: isPlaying,
    pauseVideo: pause,
    playVideo: play,
    stopPlayback: stop,
  });

  const selectedSubtitleTrack = useMemo(() => {
    const a = playSettings?.mediaSource?.MediaStreams?.find(
      (s) => s.Index === playSettings.subtitleIndex
    );
    console.log(a);
    return a;
  }, [playSettings]);

  const [hlsSubTracks, setHlsSubTracks] = useState<
    {
      index: number;
      language?: string | undefined;
      selected?: boolean | undefined;
      title?: string | undefined;
      type: any;
    }[]
  >([]);

  const selectedTextTrack = useMemo(() => {
    for (let st of hlsSubTracks) {
      if (st.title === selectedSubtitleTrack?.DisplayTitle) {
        return {
          type: SelectedTrackType.TITLE,
          value: selectedSubtitleTrack?.DisplayTitle ?? "",
        };
      }
    }
    return undefined;
  }, [hlsSubTracks]);

  const onPlaybackStateChanged = (e: PlaybackStatePayload) => {
    const { target, state, isBuffering, isPlaying } = e.nativeEvent;

    console.log("onPlaybackStateChanged", {
      target,
      state,
      isBuffering,
      isPlaying,
    });

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

    setPlaybackState(e.nativeEvent);
  };

  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

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
          }}
          style={{ width: "100%", height: "100%" }}
          onVideoProgress={onProgress}
          progressUpdateInterval={1000}
          onVideoStateChange={onPlaybackStateChanged}
        />
      </Pressable>

      {/* <VideoDebugInfo
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 10,
        }}
        playbackState={playbackState}
        progress={{
          currentTime: progress.value,
          duration: 0,
        }}
        playerRef={videoRef}
      /> */}

      <Controls
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
      />
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

export function useVideoSource(
  playSettings: PlaybackType | null,
  api: Api | null,
  poster: string | undefined,
  playUrl?: string | null
) {
  const videoSource = useMemo(() => {
    if (!playSettings || !api || !playUrl) {
      return null;
    }

    const startPosition = playSettings.item?.UserData?.PlaybackPositionTicks
      ? Math.round(
          ticksToSeconds(playSettings.item.UserData.PlaybackPositionTicks)
        )
      : 0;

    return {
      uri: playUrl,
      isNetwork: true,
      startPosition,
      headers: getAuthHeaders(api),
      metadata: {
        artist: playSettings.item?.AlbumArtist ?? undefined,
        title: playSettings.item?.Name || "Unknown",
        description: playSettings.item?.Overview ?? undefined,
        imageUri: poster,
        subtitle: playSettings.item?.Album ?? undefined,
      },
    };
  }, [playSettings, api, poster]);

  return videoSource;
}
