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
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, View, ViewProps } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import Video, {
  OnProgressData,
  SelectedTrack,
  SelectedTrackType,
  VideoRef,
} from "react-native-video";
import { SubtitleHelper } from "@/utils/SubtitleHelper";
import {
  EvilIcons,
  Feather,
  FontAwesome,
  FontAwesome5,
  FontAwesome6,
  Ionicons,
} from "@expo/vector-icons";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  itemId: string;
  audioIndexStr: string;
  subtitleIndexStr: string;
  mediaSourceId: string;
  bitrateValueStr: string;
}

export const AirplayButton: React.FC<Props> = ({
  itemId,
  audioIndexStr,
  subtitleIndexStr,
  mediaSourceId,
  bitrateValueStr,
  ...props
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const [settings] = useSettings();
  const videoRef = useRef<VideoRef | null>(null);

  const firstTime = useRef(true);
  const revalidateProgressCache = useInvalidatePlaybackProgressCache();

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);

  const setShowControls = useCallback((show: boolean) => {
    _setShowControls(show);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  useFocusEffect(
    React.useCallback(() => {
      return async () => {
        stop();
      };
    }, [])
  );

  const [open, setOpen] = useState(false);

  if (videoSource)
    return (
      <View {...props}>
        <RoundButton
          onPress={async () => {
            setOpen(true);
            setTimeout(() => {
              videoRef.current?.presentFullscreenPlayer();
            }, 1000);
          }}
          size="large"
          iconComponent={() => (
            <Feather name="airplay" size={22} color="white" />
          )}
        />
        {open ? (
          <>
            <Video
              ref={videoRef}
              style={{
                width: 0,
                height: 0,
              }}
              source={videoSource}
              resizeMode={ignoreSafeAreas ? "cover" : "contain"}
              progressUpdateInterval={500}
              playWhenInactive={true}
              allowsExternalPlayback={true}
              playInBackground={true}
              pictureInPicture={true}
              showNotificationControls={true}
              ignoreSilentSwitch="ignore"
              controls={true}
              fullscreen={open}
            />
          </>
        ) : null}
      </View>
    );
  else return <RoundButton icon="close" />;
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
        artist: item?.AlbumArtist ?? undefined,
        title: item?.Name || "Unknown",
        description: item?.Overview ?? undefined,
        imageUri: poster,
        subtitle: item?.Album ?? undefined,
      },
    };
  }, [item, api, poster, url]);

  return videoSource;
}
