/**
 * Unified Casting Player Modal
 * Protocol-agnostic full-screen player for all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getSessionApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import GoogleCast, {
  CastState,
  MediaPlayerState,
  useCastDevice,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { ChromecastDeviceSheet } from "@/components/chromecast/ChromecastDeviceSheet";
import { ChromecastEpisodeList } from "@/components/chromecast/ChromecastEpisodeList";
import { ChromecastSettingsMenu } from "@/components/chromecast/ChromecastSettingsMenu";
import { useChromecastSegments } from "@/components/chromecast/hooks/useChromecastSegments";
import { Text } from "@/components/common/Text";
import { useCasting } from "@/hooks/useCasting";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  calculateEndingTime,
  formatTime,
  formatTrickplayTime,
  getPosterUrl,
  truncateTitle,
} from "@/utils/casting/helpers";
import { buildCastMediaInfo } from "@/utils/casting/mediaInfo";
import { msToTicks, ticksToSeconds } from "@/utils/time";

export default function CastingPlayerScreen() {
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const { t } = useTranslation();

  // Get raw Chromecast state directly - same as old implementation
  const castState = useCastState();
  const mediaStatus = useMediaStatus();
  const castDevice = useCastDevice();
  // Keep hook active for connection - used by remoteMediaClient from useCasting
  useRemoteMediaClient();

  // Shared values for progress slider (must be initialized before any early returns)
  const sliderProgress = useSharedValue(0);
  const sliderMin = useSharedValue(0);
  const sliderMax = useSharedValue(100);
  const isScrubbing = useRef(false);

  // Trickplay time display
  const [trickplayTime, setTrickplayTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Track scrub percentage for trickplay bubble positioning
  const [scrubPercentage, setScrubPercentage] = useState(0);

  // Live progress tracking - update every second
  const [liveProgress, setLiveProgress] = useState(0);
  const lastSyncPositionRef = useRef(0);
  const lastSyncTimestampRef = useRef(Date.now());

  // Fetch full item data from Jellyfin by ID
  const [fetchedItem, setFetchedItem] = useState<BaseItemDto | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchItemData = async () => {
      const itemId = mediaStatus?.mediaInfo?.contentId;
      if (!itemId || !api || !user?.Id) return;

      try {
        const res = await getUserLibraryApi(api).getItem(
          { itemId, userId: user.Id },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setFetchedItem(res.data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("[Casting Player] Failed to fetch item:", error);
      }
    };

    fetchItemData();

    return () => controller.abort();
  }, [mediaStatus?.mediaInfo?.contentId, api, user?.Id]);

  useEffect(() => {
    // Sync refs whenever mediaStatus provides a new position
    if (mediaStatus?.streamPosition !== undefined) {
      lastSyncPositionRef.current = mediaStatus.streamPosition;
      lastSyncTimestampRef.current = Date.now();
      setLiveProgress(mediaStatus.streamPosition);
    }

    // Update every second when playing, deriving from last sync point
    const interval = setInterval(() => {
      if (
        mediaStatus?.playerState === MediaPlayerState.PLAYING &&
        mediaStatus?.streamPosition !== undefined
      ) {
        const elapsed = (Date.now() - lastSyncTimestampRef.current) / 1000;
        setLiveProgress(lastSyncPositionRef.current + elapsed);
      } else if (mediaStatus?.streamPosition !== undefined) {
        // Sync with actual position when paused/buffering
        setLiveProgress(mediaStatus.streamPosition);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [mediaStatus?.playerState, mediaStatus?.streamPosition]);

  // Extract item from customData, or use fetched item, or create a minimal fallback
  const currentItem = useMemo(() => {
    // Priority 1: Use fetched item from API (most reliable)
    if (fetchedItem) {
      return fetchedItem;
    }

    // Priority 2: Try customData from mediaStatus
    const customData = mediaStatus?.mediaInfo?.customData as BaseItemDto | null;
    if (
      customData?.Type &&
      (customData.ImageTags || customData.MediaSources || customData.Id)
    ) {
      // Use customData if it has a real Type AND meaningful metadata
      // (rules out placeholder objects that lack image tags, media sources, or an ID)
      return customData;
    }

    // Priority 3: Create minimal fallback while loading
    if (mediaStatus?.mediaInfo) {
      const { contentId, metadata } = mediaStatus.mediaInfo;
      // Derive type from metadata if available, otherwise omit to avoid
      // misrepresenting episodes as movies
      let metadataType: string | undefined;
      if (metadata?.type === "movie") {
        metadataType = "Movie";
      } else if (metadata?.type === "tvShow") {
        metadataType = "Episode";
      }
      return {
        Id: contentId,
        Name: metadata?.title || "Unknown",
        ...(metadataType ? { Type: metadataType } : {}),
        ServerId: "",
      } as BaseItemDto;
    }

    return null;
  }, [fetchedItem, mediaStatus?.mediaInfo]);

  // Derive state from raw Chromecast hooks
  const progress = liveProgress; // Use live-updating progress
  const duration = mediaStatus?.mediaInfo?.streamDuration ?? 0;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;
  const isBuffering = mediaStatus?.playerState === MediaPlayerState.BUFFERING;
  const currentDevice = castDevice?.friendlyName ?? null;

  const isDirectPlay = !mediaStatus?.mediaInfo?.contentUrl?.includes("m3u8");

  const [_actualBitrate, setActualBitrate] = useState<number | null>(null);
  const [selectedBitrate, setSelectedBitrate] = useState<number | null>(null);
  const [_bitrateLoading, setBitrateLoading] = useState(true);
  const [initialMaxBitrate, setInitialMaxBitrate] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!api || !currentItem?.Id || !isPlaying) return;

    setActualBitrate(null);
    setBitrateLoading(true);

    const fetchSessionBitrate = async () => {
      try {
        const { data } = await getSessionApi(api).getSessions();
        const currentSession = data.find(
          (s) => s.NowPlayingItem?.Id === currentItem.Id,
        );
        const bitrate = currentSession?.TranscodingInfo?.Bitrate;
        if (bitrate) {
          setActualBitrate(bitrate);
          // Only lock in the initial max once per item
          setInitialMaxBitrate((prev) => (prev === null ? bitrate : prev));
        } else {
          setActualBitrate(null);
        }
      } catch (error) {
        console.error(
          "[Casting Player] Failed to fetch session bitrate:",
          error,
        );
      } finally {
        setBitrateLoading(false);
      }
    };

    // Small delay to let the session establish before querying stream bitrate
    const timer = setTimeout(fetchSessionBitrate, 1500);
    return () => clearTimeout(timer);
  }, [api, currentItem?.Id, selectedBitrate, isPlaying]);

  // Reset initial max bitrate when item changes
  useEffect(() => {
    setInitialMaxBitrate(null);
  }, [currentItem?.Id]);

  // Trickplay for seeking preview - use fetched item with full data
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    fetchedItem ?? null,
  );

  // Update slider max when duration changes
  useEffect(() => {
    if (duration > 0) {
      sliderMax.value = duration * 1000; // Convert to milliseconds
    }
  }, [duration, sliderMax]);

  // Update slider progress when not scrubbing
  useEffect(() => {
    if (!isScrubbing.current && progress > 0) {
      sliderProgress.value = progress * 1000; // Convert to milliseconds
    }
  }, [progress, sliderProgress]);

  // Only use casting controls if we have a current item to avoid "No session" errors
  const castingControls = useCasting(currentItem);
  const {
    togglePlayPause,
    skipForward,
    skipBackward,
    setVolume,
    volume,
    remoteMediaClient,
  } = currentItem
    ? castingControls
    : {
        togglePlayPause: async () => {},
        skipForward: async () => {},
        skipBackward: async () => {},
        setVolume: () => {},
        volume: 1,
        remoteMediaClient: null,
      };

  // Modal states
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [showDeviceSheet, setShowDeviceSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [episodes, setEpisodes] = useState<BaseItemDto[]>([]);
  const [nextEpisode, setNextEpisode] = useState<BaseItemDto | null>(null);
  const [seasonData, setSeasonData] = useState<BaseItemDto | null>(null);

  // Track selection states
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<
    number | null
  >(null);
  const [selectedSubtitleTrackIndex, setSelectedSubtitleTrackIndex] = useState<
    number | null
  >(null);
  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1);

  // Function to reload media with new audio/subtitle/quality settings
  const reloadWithSettings = useCallback(
    async (options: {
      audioIndex?: number;
      subtitleIndex?: number | null;
      bitrateValue?: number;
    }) => {
      if (!api || !user?.Id || !currentItem?.Id || !remoteMediaClient) {
        console.warn("[Casting Player] Cannot reload - missing required data");
        return;
      }

      try {
        // Send updated settings to the receiver — it calls getPlaybackInfo itself.
        const audioStreamIndex =
          options.audioIndex ?? selectedAudioTrackIndex ?? undefined;
        const subtitleStreamIndex =
          options.subtitleIndex === null ? undefined : options.subtitleIndex;
        await remoteMediaClient.loadMedia({
          mediaInfo: buildCastMediaInfo({
            item: currentItem,
            api,
            enableH265: settings.enableH265ForChromecast,
            audioStreamIndex,
            subtitleStreamIndex,
            maxStreamingBitrate: options.bitrateValue,
          }),
        });
      } catch (error) {
        console.error("[Casting Player] Failed to reload stream:", error);
      }
    },
    [
      api,
      user?.Id,
      currentItem,
      remoteMediaClient,
      mediaStatus?.streamPosition,
      settings.enableH265ForChromecast,
      selectedAudioTrackIndex,
    ],
  );

  // Load a different episode on the Chromecast
  const loadEpisode = useCallback(
    async (episode: BaseItemDto) => {
      if (!api || !user?.Id || !episode.Id || !remoteMediaClient) return;

      try {
        const startTimeTicks = episode.UserData?.PlaybackPositionTicks ?? 0;
        await remoteMediaClient.loadMedia({
          mediaInfo: buildCastMediaInfo({
            item: episode,
            api,
            enableH265: settings.enableH265ForChromecast,
            startTimeTicks,
          }),
          startTime: startTimeTicks / 10000000,
        });

        // Reset track selections for new episode
        setSelectedAudioTrackIndex(null);
        setSelectedSubtitleTrackIndex(null);
      } catch (error) {
        console.error("[Casting Player] Failed to load episode:", error);
      }
    },
    [api, user?.Id, remoteMediaClient, settings.enableH265ForChromecast],
  );

  // Fetch season data for season poster
  useEffect(() => {
    if (
      currentItem?.Type !== "Episode" ||
      !currentItem.SeasonId ||
      !api ||
      !user?.Id
    )
      return;

    const fetchSeasonData = async () => {
      try {
        const userLibraryApi = getUserLibraryApi(api);
        const response = await userLibraryApi.getItem({
          itemId: currentItem.SeasonId!,
          userId: user.Id!,
        });
        setSeasonData(response.data);
      } catch (error) {
        console.error("[Casting Player] Failed to fetch season data:", error);
        setSeasonData(null);
      }
    };

    fetchSeasonData();
  }, [currentItem?.Type, currentItem?.SeasonId, api, user?.Id]);

  const availableAudioTracks = useMemo(() => {
    if (!currentItem?.MediaStreams) return [];

    return currentItem.MediaStreams.filter(
      (stream) => stream.Type === "Audio",
    ).map((stream) => ({
      index: stream.Index ?? 0,
      language: stream.Language || "Unknown",
      displayTitle:
        stream.DisplayTitle ||
        `${stream.Language || "Unknown"} ${stream.Codec || ""}`.trim(),
      codec: stream.Codec || "Unknown",
      channels: stream.Channels,
      bitrate: stream.BitRate,
    }));
  }, [currentItem?.MediaStreams]);

  const availableSubtitleTracks = useMemo(() => {
    if (!currentItem?.MediaStreams) return [];

    return currentItem.MediaStreams.filter(
      (stream) => stream.Type === "Subtitle",
    ).map((stream) => ({
      index: stream.Index ?? 0,
      language: stream.Language || "Unknown",
      displayTitle:
        stream.DisplayTitle ||
        [
          stream.Language || "Unknown",
          stream.IsForced ? " (Forced)" : "",
          stream.Title ? ` - ${stream.Title}` : "",
        ].join(""),
      codec: stream.Codec || "Unknown",
      isForced: stream.IsForced || false,
      isExternal: stream.IsExternal || false,
    }));
  }, [currentItem?.MediaStreams]);

  const availableMediaSources = useMemo(() => {
    // Get the original source bitrate
    const originalBitrate =
      currentItem?.MediaStreams?.find((s) => s.Type === "Video")?.BitRate ||
      20000000; // Default to 20Mbps if unknown

    const maxBitrate = isDirectPlay
      ? originalBitrate
      : (initialMaxBitrate ?? originalBitrate);

    // Generate max label based on direct play or transcoding
    const maxLabel = isDirectPlay
      ? `Max (${Math.round(originalBitrate / 1000000)} Mb/s)`
      : initialMaxBitrate
        ? `Max (${Math.round(initialMaxBitrate / 1000000)} Mb/s)`
        : `Max (${Math.round(originalBitrate / 1000000)} Mb/s)`;

    // Generate bitrate variants
    const variants = [
      {
        id: `${currentItem?.Id}-max`,
        name: maxLabel,
        bitrate: maxBitrate,
        container: currentItem?.MediaSources?.[0]?.Container || "mp4",
      },
      {
        id: `${currentItem?.Id}-8mbps`,
        name: "8 Mb/s",
        bitrate: 8000000,
        container: currentItem?.MediaSources?.[0]?.Container || "mp4",
      },
      {
        id: `${currentItem?.Id}-4mbps`,
        name: "4 Mb/s",
        bitrate: 4000000,
        container: currentItem?.MediaSources?.[0]?.Container || "mp4",
      },
      {
        id: `${currentItem?.Id}-2mbps`,
        name: "2 Mb/s",
        bitrate: 2000000,
        container: currentItem?.MediaSources?.[0]?.Container || "mp4",
      },
      {
        id: `${currentItem?.Id}-1mbps`,
        name: "1 Mb/s",
        bitrate: 1000000,
        container: currentItem?.MediaSources?.[0]?.Container || "mp4",
      },
    ];

    return variants;
  }, [
    currentItem?.MediaSources,
    currentItem?.MediaStreams,
    currentItem?.Id,
    isDirectPlay,
    initialMaxBitrate,
  ]);

  // Fetch episodes for TV shows
  useEffect(() => {
    if (currentItem?.Type !== "Episode" || !currentItem.SeriesId || !api)
      return;

    const fetchEpisodes = async () => {
      try {
        const tvShowsApi = getTvShowsApi(api);
        // Fetch ALL episodes from ALL seasons by removing seasonId filter
        const response = await tvShowsApi.getEpisodes({
          seriesId: currentItem.SeriesId!,
          // Don't filter by seasonId - get all seasons
          userId: api.accessToken ? undefined : "",
        });

        const episodeList = response.data.Items || [];
        setEpisodes(episodeList);

        // Find next episode
        const currentIndex = episodeList.findIndex(
          (ep) => ep.Id === currentItem.Id,
        );
        if (currentIndex >= 0 && currentIndex < episodeList.length - 1) {
          setNextEpisode(episodeList[currentIndex + 1]);
        } else {
          setNextEpisode(null);
        }
      } catch (error) {
        console.error("Failed to fetch episodes:", error);
      }
    };

    fetchEpisodes();
  }, [
    currentItem?.Type,
    currentItem?.SeriesId,
    currentItem?.SeasonId,
    currentItem?.Id,
    api,
  ]);

  // NOTE: Auto-navigation to casting-player is handled by higher-level
  // components (e.g., CastingMiniPlayer or Chromecast button). We intentionally
  // do NOT call router.replace("/casting-player") here because this component
  // IS the casting-player screen — doing so would cause redundant navigation loops.

  // Segment detection (skip intro/credits) - use progress in seconds for accurate detection
  const { currentSegment, skipIntro, skipCredits, skipSegment } =
    useChromecastSegments(currentItem, progress * 1000, false);

  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  const dismissModal = useCallback(() => {
    // Navigate immediately without animation to prevent crashes
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/(tabs)/(home)/");
    }
  }, [router]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      // Only allow downward swipes from top of screen
      if (event.translationY > 0) {
        translateY.value = context.value.y + event.translationY;
      }
    })
    .onEnd((event) => {
      // Dismiss if swiped down more than 150px or fast swipe
      if (event.translationY > 150 || event.velocityY > 600) {
        // Animate down and dismiss
        translateY.value = withSpring(
          1000,
          {
            damping: 20,
            stiffness: 90,
          },
          () => {
            scheduleOnRN(dismissModal);
          },
        );
      } else {
        // Spring back to position
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Memoize expensive calculations (before early return)
  const posterUrl = useMemo(() => {
    if (!api?.basePath || !currentItem?.Id) return null;

    // For episodes, use SEASON poster instead of episode poster
    if (currentItem.Type === "Episode" && seasonData?.Id) {
      // Use ParentPrimaryImageItemId if available, otherwise use season's own ImageTags
      const imageItemId = seasonData.ParentPrimaryImageItemId || seasonData.Id;
      const seasonImageTag = seasonData.ImageTags?.Primary;
      return seasonImageTag
        ? `${api.basePath}/Items/${imageItemId}/Images/Primary?fillHeight=450&fillWidth=300&quality=96&tag=${seasonImageTag}`
        : `${api.basePath}/Items/${imageItemId}/Images/Primary?fillHeight=450&fillWidth=300&quality=96`;
    }

    // Fallback to item poster for non-episodes or if season data not loaded
    return getPosterUrl(
      api.basePath,
      currentItem.Id,
      currentItem.ImageTags?.Primary,
      260,
      390,
    );
  }, [
    api?.basePath,
    currentItem?.Id,
    currentItem?.Type,
    seasonData?.Id,
    seasonData?.ImageTags?.Primary,
    currentItem?.ImageTags?.Primary,
  ]);

  const protocolColor = "#a855f7"; // Streamyfin purple

  // Redirect if not connected - check CastState like old implementation
  useEffect(() => {
    // Redirect immediately when disconnected or no devices
    if (
      castState === CastState.NOT_CONNECTED ||
      castState === CastState.NO_DEVICES_AVAILABLE
    ) {
      // Use setTimeout to avoid state update during render
      const timer = setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(auth)/(tabs)/(home)/");
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [castState, router]);

  // Also redirect if mediaStatus disappears (media ended or stopped)
  useEffect(() => {
    if (castState === CastState.CONNECTED && !mediaStatus) {
      const timer = setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(auth)/(tabs)/(home)/");
        }
      }, 500); // Small delay to allow for media transitions

      return () => clearTimeout(timer);
    }
  }, [castState, mediaStatus, router]);

  // Show loading while connecting
  if (castState === CastState.CONNECTING) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size='large' color='#fff' />
        <Text style={{ color: "#fff", marginTop: 16 }}>
          {t("casting_player.connecting")}
        </Text>
      </View>
    );
  }

  // Don't render if not connected or no media playing
  if (castState !== CastState.CONNECTED || !mediaStatus || !currentItem) {
    return null;
  }

  const screenWidth = Dimensions.get("window").width;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: "",
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: "#000",
            },
            animatedStyle,
          ]}
        >
          {/* Header - Fixed at top */}
          <View
            style={{
              position: "absolute",
              top: insets.top + 8,
              left: 20,
              right: 20,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              zIndex: 100,
            }}
          >
            <Pressable
              onPress={dismissModal}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <Ionicons name='chevron-down' size={32} color='white' />
            </Pressable>

            {/* Connection indicator */}
            <Pressable
              onPress={() => setShowDeviceSheet(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: "#1a1a1a",
                borderRadius: 16,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: protocolColor,
                }}
              />
              <Text
                style={{
                  color: protocolColor,
                  fontSize: 14,
                  fontWeight: "500",
                }}
              >
                {currentDevice || t("casting_player.unknown_device")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowSettings(true)}
              style={{ padding: 8, marginRight: -8 }}
            >
              <Ionicons name='settings-outline' size={24} color='white' />
            </Pressable>
          </View>

          {/* Title Area */}
          <View
            style={{
              position: "absolute",
              top: insets.top + 50,
              left: 0,
              right: 0,
              zIndex: 95,
              alignItems: "center",
              backgroundColor: "rgba(0, 0, 0, 0.8)",
              paddingVertical: 16,
              paddingHorizontal: 20,
            }}
          >
            {/* Title */}
            <Text
              style={{
                color: "white",
                fontSize: 20,
                fontWeight: "700",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              {truncateTitle(
                currentItem.Name || t("casting_player.unknown"),
                50,
              )}
            </Text>

            {/* Grey episode/season info */}
            {currentItem.Type === "Episode" &&
              currentItem.ParentIndexNumber !== undefined &&
              currentItem.IndexNumber !== undefined && (
                <Text
                  style={{
                    color: "#999",
                    fontSize: 15,
                    textAlign: "center",
                  }}
                >
                  {t("casting_player.season_episode_format", {
                    season: currentItem.ParentIndexNumber,
                    episode: currentItem.IndexNumber,
                  })}
                </Text>
              )}
          </View>

          {/* Scrollable content area */}
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: insets.top + 160,
              paddingBottom: insets.bottom + 500,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Poster with buffering overlay */}
            <View
              style={{
                alignItems: "center",
                marginBottom: 40,
              }}
            >
              <View
                style={{
                  width: screenWidth * 0.55,
                  height: screenWidth * 0.55 * 1.5,
                  borderRadius: 12,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {posterUrl ? (
                  <Image
                    source={{ uri: posterUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit='cover'
                  />
                ) : (
                  <View
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: "#1a1a1a",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name='film-outline' size={64} color='#333' />
                  </View>
                )}

                {/* Skip intro/credits bar at bottom of poster */}
                {currentSegment && (
                  <Pressable
                    onPress={async () => {
                      if (!remoteMediaClient) return;
                      try {
                        const seekFn = async (positionMs: number) => {
                          if (
                            mediaStatus?.playerState ===
                              MediaPlayerState.PLAYING ||
                            mediaStatus?.playerState === MediaPlayerState.PAUSED
                          ) {
                            await remoteMediaClient.seek({
                              position: positionMs / 1000,
                            });
                          }
                        };
                        if (currentSegment.type === "intro") {
                          await skipIntro(seekFn);
                        } else if (currentSegment.type === "credits") {
                          await skipCredits(seekFn);
                        } else {
                          await skipSegment(seekFn);
                        }
                      } catch (error) {
                        console.error("[Casting Player] Skip error:", error);
                      }
                    }}
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      backgroundColor: protocolColor,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name='play-skip-forward'
                      size={18}
                      color='white'
                    />
                    <Text
                      style={{
                        color: "white",
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {t(
                        `player.skip_${currentSegment.type === "credits" ? "outro" : currentSegment.type}`,
                      )}
                    </Text>
                  </Pressable>
                )}

                {/* Buffering overlay */}
                {isBuffering && (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(0,0,0,0.7)",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <ActivityIndicator size='large' color={protocolColor} />
                    <Text
                      style={{
                        color: "white",
                        fontSize: 16,
                        marginTop: 16,
                      }}
                    >
                      {t("casting_player.buffering")}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Fixed 4-button control row for episodes - positioned independently */}
          {currentItem.Type === "Episode" && (
            <View
              style={{
                position: "absolute",
                bottom: insets.bottom + 200,
                left: 0,
                right: 0,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 16,
                paddingHorizontal: 20,
              }}
            >
              {/* Episodes button */}
              <Pressable
                onPress={() => setShowEpisodeList(true)}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  padding: 12,
                  borderRadius: 12,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name='list' size={22} color='white' />
              </Pressable>

              {/* Previous episode button */}
              <Pressable
                onPress={async () => {
                  const currentIndex = episodes.findIndex(
                    (ep) => ep.Id === currentItem.Id,
                  );
                  if (currentIndex > 0) {
                    await loadEpisode(episodes[currentIndex - 1]);
                  }
                }}
                disabled={
                  episodes.findIndex((ep) => ep.Id === currentItem.Id) <= 0
                }
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  padding: 12,
                  borderRadius: 12,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  opacity:
                    episodes.findIndex((ep) => ep.Id === currentItem.Id) <= 0
                      ? 0.4
                      : 1,
                }}
              >
                <Ionicons name='play-skip-back' size={22} color='white' />
              </Pressable>

              {/* Next episode button */}
              <Pressable
                onPress={async () => {
                  if (nextEpisode) {
                    await loadEpisode(nextEpisode);
                  }
                }}
                disabled={!nextEpisode}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  padding: 12,
                  borderRadius: 12,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: nextEpisode ? 1 : 0.4,
                }}
              >
                <Ionicons name='play-skip-forward' size={22} color='white' />
              </Pressable>

              {/* Stop playback button - stops media but stays connected to Chromecast */}
              <Pressable
                onPress={async () => {
                  try {
                    // Stop the current media playback (don't disconnect from Chromecast)
                    if (remoteMediaClient) {
                      await remoteMediaClient.stop();
                    }

                    // Navigate back/close the player (mini player will disappear since no media is playing)
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace("/(auth)/(tabs)/(home)/");
                    }
                  } catch (error) {
                    console.error(
                      "[Casting Player] Error stopping playback:",
                      error,
                    );
                    // Navigate anyway
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace("/(auth)/(tabs)/(home)/");
                    }
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#1a1a1a",
                  padding: 12,
                  borderRadius: 12,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name='stop-circle' size={22} color='white' />
              </Pressable>
            </View>
          )}

          {/* Fixed bottom controls area */}
          <View
            style={{
              position: "absolute",
              bottom: insets.bottom + 10,
              left: 20,
              right: 20,
              zIndex: 98,
            }}
          >
            {/* Progress slider with trickplay preview */}
            <View style={{ marginTop: 8, height: 40 }}>
              <Slider
                style={{ width: "100%", height: 40 }}
                progress={sliderProgress}
                minimumValue={sliderMin}
                maximumValue={sliderMax}
                theme={{
                  maximumTrackTintColor: "#333",
                  minimumTrackTintColor: protocolColor,
                  bubbleBackgroundColor: protocolColor,
                  bubbleTextColor: "#fff",
                }}
                onSlidingStart={() => {
                  isScrubbing.current = true;
                }}
                onValueChange={(value) => {
                  // Calculate trickplay preview
                  const progressInTicks = msToTicks(value);
                  calculateTrickplayUrl(progressInTicks);

                  // Update time display for trickplay bubble
                  const progressInSeconds = Math.floor(
                    ticksToSeconds(progressInTicks),
                  );
                  const hours = Math.floor(progressInSeconds / 3600);
                  const minutes = Math.floor((progressInSeconds % 3600) / 60);
                  const seconds = progressInSeconds % 60;
                  setTrickplayTime({ hours, minutes, seconds });

                  // Track scrub percentage for bubble positioning
                  const durationMs = duration * 1000;
                  if (durationMs > 0) {
                    setScrubPercentage(value / durationMs);
                  }
                }}
                onSlidingComplete={(value) => {
                  isScrubbing.current = false;
                  // Seek to the position (value is in milliseconds, convert to seconds)
                  const positionSeconds = value / 1000;
                  if (remoteMediaClient && duration > 0) {
                    remoteMediaClient
                      .seek({ position: positionSeconds })
                      .catch((error) => {
                        console.error("[Casting Player] Seek error:", error);
                      });
                  }
                }}
                renderBubble={() => {
                  // Calculate bubble position with edge clamping
                  const screenWidth = Dimensions.get("window").width;
                  const containerPadding = 20; // left/right padding of slider container (matches style)
                  const thumbWidth = 16; // matches thumbWidth prop on Slider
                  const sliderWidth = screenWidth - containerPadding * 2;
                  // Adjust thumb position to account for thumb width affecting travel range
                  const effectiveTrackWidth = sliderWidth - thumbWidth;
                  const thumbPosition =
                    thumbWidth / 2 + scrubPercentage * effectiveTrackWidth;

                  if (!trickPlayUrl || !trickplayInfo) {
                    // Show simple time bubble when no trickplay
                    const timeBubbleWidth = 80;
                    // Clamp position so bubble stays on screen
                    // minLeft prevents going off left edge, maxLeft prevents going off right edge
                    const minLeft = -thumbPosition;
                    const maxLeft =
                      sliderWidth - thumbPosition - timeBubbleWidth;
                    const centeredLeft = -timeBubbleWidth / 2;
                    const clampedLeft = Math.max(
                      minLeft,
                      Math.min(maxLeft, centeredLeft),
                    );

                    return (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 20,
                          left: clampedLeft,
                          backgroundColor: protocolColor,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {formatTrickplayTime(trickplayTime)}
                        </Text>
                      </View>
                    );
                  }

                  const { x, y, url } = trickPlayUrl;
                  const tileWidth = 220; // Larger preview for casting player
                  const tileHeight =
                    tileWidth / (trickplayInfo.aspectRatio ?? 1.78);

                  // Calculate clamped position for trickplay preview
                  // minLeft: furthest left (when thumb is at left edge)
                  // maxLeft: furthest right (when thumb is at right edge)
                  const minLeft = -thumbPosition;
                  const maxLeft = sliderWidth - thumbPosition - tileWidth;
                  const centeredLeft = -tileWidth / 2;
                  const clampedLeft = Math.max(
                    minLeft,
                    Math.min(maxLeft, centeredLeft),
                  );

                  return (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 20,
                        left: clampedLeft,
                        width: tileWidth,
                        alignItems: "center",
                      }}
                    >
                      {/* Trickplay image preview */}
                      <View
                        style={{
                          width: tileWidth,
                          height: tileHeight,
                          borderRadius: 8,
                          overflow: "hidden",
                          backgroundColor: "#1a1a1a",
                        }}
                      >
                        <Image
                          cachePolicy='memory-disk'
                          style={{
                            width:
                              tileWidth * (trickplayInfo.data?.TileWidth ?? 1),
                            height:
                              (tileWidth /
                                (trickplayInfo.aspectRatio ?? 1.78)) *
                              (trickplayInfo.data?.TileHeight ?? 1),
                            transform: [
                              { translateX: -x * tileWidth },
                              { translateY: -y * tileHeight },
                            ],
                          }}
                          source={{ uri: url }}
                          contentFit='cover'
                        />
                      </View>
                      {/* Time overlay */}
                      <View
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          backgroundColor: "rgba(0, 0, 0, 0.7)",
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {formatTrickplayTime(trickplayTime)}
                        </Text>
                      </View>
                    </View>
                  );
                }}
                sliderHeight={6}
                thumbWidth={16}
                panHitSlop={{ top: 30, bottom: 30, left: 10, right: 10 }}
              />
            </View>

            {/* Time display */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <Text style={{ color: "#999", fontSize: 13 }}>
                {formatTime(progress * 1000)}
              </Text>
              <Text style={{ color: "#999", fontSize: 13 }}>
                {t("casting_player.ending_at", {
                  time: calculateEndingTime(progress * 1000, duration * 1000),
                })}
              </Text>
              <Text style={{ color: "#999", fontSize: 13 }}>
                {formatTime(duration * 1000)}
              </Text>
            </View>

            {/* Playback controls */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 32,
                marginBottom: 24,
              }}
            >
              {/* Rewind (use settings) */}
              <Pressable
                onPress={() => skipBackward(settings?.rewindSkipTime ?? 10)}
                style={{
                  position: "relative",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name='refresh-outline'
                  size={48}
                  color='white'
                  style={{ transform: [{ scaleY: -1 }, { rotate: "180deg" }] }}
                />
                {settings?.rewindSkipTime != null && (
                  <Text
                    style={{
                      position: "absolute",
                      color: "white",
                      fontSize: 15,
                      fontWeight: "bold",
                      bottom: 10,
                    }}
                  >
                    {settings.rewindSkipTime}
                  </Text>
                )}
              </Pressable>

              {/* Play/Pause */}
              <Pressable
                onPress={togglePlayPause}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: protocolColor,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={36}
                  color='white'
                  style={{ marginLeft: isPlaying ? 0 : 4 }}
                />
              </Pressable>

              {/* Forward (use settings) */}
              <Pressable
                onPress={() => skipForward(settings?.forwardSkipTime ?? 10)}
                style={{
                  position: "relative",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name='refresh-outline' size={48} color='white' />
                {settings?.forwardSkipTime != null && (
                  <Text
                    style={{
                      position: "absolute",
                      color: "white",
                      fontSize: 15,
                      fontWeight: "bold",
                      bottom: 10,
                    }}
                  >
                    {settings.forwardSkipTime}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Modals */}
          <ChromecastDeviceSheet
            visible={showDeviceSheet}
            onClose={() => setShowDeviceSheet(false)}
            device={
              currentDevice && castDevice
                ? { friendlyName: currentDevice }
                : null
            }
            onDisconnect={async () => {
              try {
                // End the casting session and disconnect completely
                const sessionManager = GoogleCast.getSessionManager();
                await sessionManager.endCurrentSession(true);
                setShowDeviceSheet(false);
                // Close player immediately after disconnecting
                setTimeout(() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace("/(auth)/(tabs)/(home)/");
                  }
                }, 100);
              } catch (error) {
                console.error(
                  "[Casting Player] Error disconnecting from Chromecast:",
                  error,
                );
              }
            }}
            volume={volume}
            onVolumeChange={async (vol) => {
              try {
                setVolume(vol);
              } catch (error) {
                console.error("[Casting Player] Failed to set volume:", error);
              }
            }}
          />

          <ChromecastEpisodeList
            visible={showEpisodeList}
            onClose={() => setShowEpisodeList(false)}
            currentItem={currentItem}
            episodes={episodes}
            api={api}
            onSelectEpisode={async (episode) => {
              setShowEpisodeList(false);
              await loadEpisode(episode);
            }}
          />

          <ChromecastSettingsMenu
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            item={currentItem}
            mediaSources={availableMediaSources.filter((source) => {
              const ceiling = initialMaxBitrate ?? Number.POSITIVE_INFINITY;
              return (source.bitrate || 0) <= ceiling;
            })}
            selectedMediaSource={
              selectedBitrate === null
                ? availableMediaSources[0] || null
                : availableMediaSources.find(
                    (s) => s.bitrate === selectedBitrate,
                  ) || null
            }
            onMediaSourceChange={(source) => {
              setSelectedBitrate(source.bitrate ?? null);
              reloadWithSettings({ bitrateValue: source.bitrate });
            }}
            audioTracks={availableAudioTracks}
            selectedAudioTrack={
              selectedAudioTrackIndex === null
                ? availableAudioTracks[0] || null
                : availableAudioTracks.find(
                    (t) => t.index === selectedAudioTrackIndex,
                  ) || null
            }
            onAudioTrackChange={(track) => {
              setSelectedAudioTrackIndex(track.index);
              // Reload stream with new audio track
              reloadWithSettings({ audioIndex: track.index });
            }}
            subtitleTracks={availableSubtitleTracks}
            selectedSubtitleTrack={
              selectedSubtitleTrackIndex === null
                ? null
                : availableSubtitleTracks.find(
                    (t) => t.index === selectedSubtitleTrackIndex,
                  ) || null
            }
            onSubtitleTrackChange={(track) => {
              setSelectedSubtitleTrackIndex(track?.index ?? null);
              // Reload stream with new subtitle track
              reloadWithSettings({ subtitleIndex: track?.index ?? null });
            }}
            playbackSpeed={currentPlaybackSpeed}
            onPlaybackSpeedChange={(speed) => {
              setCurrentPlaybackSpeed(speed);
              remoteMediaClient?.setPlaybackRate(speed).catch(console.error);
            }}
          />
        </Animated.View>
      </GestureDetector>
    </>
  );
}
