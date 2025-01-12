import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { useOrientation } from "@/hooks/useOrientation";
import { useOrientationSettings } from "@/hooks/useOrientationSettings";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import { TrackInfo } from "@/modules/vlc-player";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import transcoding from "@/utils/profiles/transcoding";
import { secondsToTicks } from "@/utils/secondsToTicks";
import { Api } from "@jellyfin/sdk";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useHaptic } from "@/hooks/useHaptic";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Video, {
  OnProgressData,
  SelectedTrack,
  SelectedTrackType,
  VideoRef,
} from "react-native-video";
import { SubtitleHelper } from "@/utils/SubtitleHelper";

const Player = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const [settings] = useSettings();
  const videoRef = useRef<VideoRef | null>(null);

  const firstTime = useRef(true);
  const revalidateProgressCache = useInvalidatePlaybackProgressCache();
  const lightHapticFeedback = useHaptic("light");

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const setShowControls = useCallback((show: boolean) => {
    _setShowControls(show);
    lightHapticFeedback();
  }, []);

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
      if (!api) {
        throw new Error("No api");
      }

      if (!itemId) {
        console.warn("No itemId");
        return null;
      }

      const res = await getUserLibraryApi(api).getItem({
        itemId,
        userId: user?.Id,
      });

      return res.data;
    },
    staleTime: 0,
  });

  // TODO: NEED TO FIND A WAY TO FROM SWITCHING TO IMAGE BASED TO TEXT BASED SUBTITLES, THERE IS A BUG.
  // MOST LIKELY LIKELY NEED A MASSIVE REFACTOR.
  const {
    data: stream,
    isLoading: isLoadingStreamUrl,
    isError: isErrorStreamUrl,
  } = useQuery({
    queryKey: ["stream-url", itemId, bitrateValue, mediaSourceId, audioIndex],

    queryFn: async () => {
      if (!api) {
        throw new Error("No api");
      }

      if (!item) {
        console.warn("No item", itemId, item);
        return null;
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
        deviceProfile: transcoding,
      });

      if (!res) return null;

      const { mediaSource, sessionId, url } = res;

      if (!sessionId || !mediaSource || !url) {
        console.warn("No sessionId or mediaSource or url", url);
        return null;
      }

      return {
        mediaSource,
        sessionId,
        url,
      };
    },
    enabled: !!item,
    staleTime: 0,
  });

  const poster = usePoster(item, api);
  const videoSource = useVideoSource(item, api, poster, stream?.url);

  const togglePlay = useCallback(async () => {
    lightHapticFeedback();
    if (isPlaying) {
      videoRef.current?.pause();
      await getPlaystateApi(api!).onPlaybackProgress({
        itemId: item?.Id!,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: Math.floor(progress.value),
        isPaused: true,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream?.sessionId,
      });
    } else {
      videoRef.current?.resume();
      await getPlaystateApi(api!).onPlaybackProgress({
        itemId: item?.Id!,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: Math.floor(progress.value),
        isPaused: false,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream?.sessionId,
      });
    }
  }, [
    isPlaying,
    api,
    item,
    videoRef,
    settings,
    stream,
    audioIndex,
    subtitleIndex,
    mediaSourceId,
  ]);

  const play = useCallback(() => {
    videoRef.current?.resume();
    reportPlaybackStart();
  }, [videoRef]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
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
    revalidateProgressCache();
  };

  const stop = useCallback(() => {
    reportPlaybackStopped();
    videoRef.current?.pause();
    setIsPlaybackStopped(true);
  }, [videoRef, reportPlaybackStopped]);

  const reportPlaybackStart = async () => {
    if (!item?.Id) return;
    await getPlaystateApi(api!).onPlaybackStart({
      itemId: item.Id,
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

      const ticks = secondsToTicks(data.currentTime);

      progress.value = ticks;
      cacheProgress.value = secondsToTicks(data.playableDuration);

      // TODO: Use this when streaming with HLS url, but NOT when direct playing
      // TODO: since playable duration is always 0 then.
      setIsBuffering(data.playableDuration === 0);

      if (!item?.Id || data.currentTime === 0) {
        return;
      }

      await getPlaystateApi(api!).onPlaybackProgress({
        itemId: item.Id,
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
      isSeeking,
      stream,
      mediaSourceId,
      audioIndex,
      subtitleIndex,
    ]
  );

  useOrientation();
  useOrientationSettings();

  useWebSocket({
    isPlaying: isPlaying,
    togglePlay: togglePlay,
    stopPlayback: stop,
    offline: false,
  });

  const [selectedTextTrack, setSelectedTextTrack] = useState<
    SelectedTrack | undefined
  >();

  const [embededTextTracks, setEmbededTextTracks] = useState<
    {
      index: number;
      language?: string | undefined;
      selected?: boolean | undefined;
      title?: string | undefined;
      type: any;
    }[]
  >([]);

  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<
    SelectedTrack | undefined
  >(undefined);

  useEffect(() => {
    if (selectedTextTrack === undefined) {
      const subtitleHelper = new SubtitleHelper(
        stream?.mediaSource.MediaStreams ?? []
      );
      const embeddedTrackIndex = subtitleHelper.getEmbeddedTrackIndex(
        subtitleIndex!
      );

      // Most likely the subtitle is burned in.
      if (embeddedTrackIndex === -1) return;

      setSelectedTextTrack({
        type: SelectedTrackType.INDEX,
        value: embeddedTrackIndex,
      });
    }
  }, [embededTextTracks]);

  const getAudioTracks = (): TrackInfo[] => {
    return audioTracks.map((t) => ({
      name: t.name,
      index: t.index,
    }));
  };

  const getSubtitleTracks = (): TrackInfo[] => {
    return embededTextTracks.map((t) => ({
      name: t.title ?? "",
      index: t.index,
      language: t.language,
    }));
  };

  useFocusEffect(
    React.useCallback(() => {
      return async () => {
        stop();
      };
    }, [])
  );

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
        }}
      >
        {videoSource ? (
          <>
            <Video
              ref={videoRef}
              source={videoSource}
              style={{
                height: "100%",
                width: "100%",
              }}
              resizeMode={ignoreSafeAreas ? "cover" : "contain"}
              onProgress={onProgress}
              onError={(e) => {
                console.error("Error playing video", e);
              }}
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
              showNotificationControls={true}
              ignoreSilentSwitch="ignore"
              fullscreen={false}
              onPlaybackStateChanged={(state) => {
                if (isSeeking.value === false) setIsPlaying(state.isPlaying);
              }}
              onTextTracks={(data) => {
                setEmbededTextTracks(data.textTracks as any);
              }}
              onBuffer={(e) => {
                setIsBuffering(e.isBuffering);
              }}
              onAudioTracks={(e) => {
                setAudioTracks(
                  e.audioTracks.map((t) => ({
                    index: t.index,
                    name: t.title ?? "",
                    language: t.language,
                  }))
                );
              }}
              selectedTextTrack={selectedTextTrack}
              selectedAudioTrack={selectedAudioTrack}
            />
          </>
        ) : (
          <Text>No video source...</Text>
        )}
      </View>

      {item && (
        <Controls
          mediaSource={stream?.mediaSource}
          videoRef={videoRef}
          enableTrickplay={true}
          item={item}
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
          seek={seek}
          play={play}
          pause={pause}
          stop={stop}
          getSubtitleTracks={getSubtitleTracks}
          setSubtitleTrack={(i) => {
            if (i === -1) {
              setSelectedTextTrack({
                type: SelectedTrackType.DISABLED,
                value: undefined,
              });
              return;
            }
            setSelectedTextTrack({
              type: SelectedTrackType.INDEX,
              value: i,
            });
          }}
          getAudioTracks={getAudioTracks}
          setAudioTrack={(i) => {
            setSelectedAudioTrack({
              type: SelectedTrackType.INDEX,
              value: i,
            });
          }}
        />
      )}
    </View>
  );
};

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
        title: item?.Name || "Unknown",
        description: item?.Overview ?? undefined,
        imageUri: poster,
        subtitle: item?.Album ?? undefined,
      },
    };
  }, [item, api, poster, url]);

  return videoSource;
}

export default Player;
