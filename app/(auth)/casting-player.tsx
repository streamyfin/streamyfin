/**
 * Unified Casting Player Modal
 * Protocol-agnostic full-screen player for all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getTvShowsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChromecastDeviceSheet } from "@/components/chromecast/ChromecastDeviceSheet";
import { ChromecastEpisodeList } from "@/components/chromecast/ChromecastEpisodeList";
import { ChromecastSettingsMenu } from "@/components/chromecast/ChromecastSettingsMenu";
import { useChromecastSegments } from "@/components/chromecast/hooks/useChromecastSegments";
import { Text } from "@/components/common/Text";
import { useCasting } from "@/hooks/useCasting";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  calculateEndingTime,
  formatTime,
  getPosterUrl,
  shouldShowNextEpisodeCountdown,
  truncateTitle,
} from "@/utils/casting/helpers";
import type { CastProtocol } from "@/utils/casting/types";

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
  useRemoteMediaClient(); // Keep connection active

  // Live progress tracking - update every second
  const [liveProgress, setLiveProgress] = useState(0);

  // Fetch full item data from Jellyfin by ID
  const [fetchedItem, setFetchedItem] = useState<BaseItemDto | null>(null);
  const [_isFetchingItem, setIsFetchingItem] = useState(false);

  useEffect(() => {
    const fetchItemData = async () => {
      const itemId = mediaStatus?.mediaInfo?.contentId;
      if (!itemId || !api || !user?.Id) return;

      setIsFetchingItem(true);
      try {
        const res = await getUserLibraryApi(api).getItem({
          itemId,
          userId: user.Id,
        });
        console.log("[Casting Player] Fetched full item from API:", {
          Type: res.data.Type,
          Name: res.data.Name,
          SeriesName: res.data.SeriesName,
          SeasonId: res.data.SeasonId,
          ParentIndexNumber: res.data.ParentIndexNumber,
          IndexNumber: res.data.IndexNumber,
        });
        setFetchedItem(res.data);
      } catch (error) {
        console.error("[Casting Player] Failed to fetch item:", error);
      } finally {
        setIsFetchingItem(false);
      }
    };

    fetchItemData();
  }, [mediaStatus?.mediaInfo?.contentId, api, user?.Id]);

  useEffect(() => {
    // Initialize with actual position
    if (mediaStatus?.streamPosition) {
      setLiveProgress(mediaStatus.streamPosition);
    }

    // Update every second when playing
    const interval = setInterval(() => {
      if (
        mediaStatus?.playerState === MediaPlayerState.PLAYING &&
        mediaStatus?.streamPosition !== undefined
      ) {
        setLiveProgress((prev) => prev + 1);
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
      console.log("[Casting Player] Using fetched item from API");
      return fetchedItem;
    }

    // Priority 2: Try customData from mediaStatus
    const customData = mediaStatus?.mediaInfo?.customData as BaseItemDto | null;
    if (customData?.Type && customData.Type !== "Movie") {
      // Only use customData if it has a real Type (not default fallback)
      console.log("[Casting Player] Using customData item:", {
        Type: customData.Type,
        Name: customData.Name,
      });
      return customData;
    }

    // Priority 3: Create minimal fallback while loading
    if (mediaStatus?.mediaInfo) {
      const { contentId, metadata } = mediaStatus.mediaInfo;
      console.log(
        "[Casting Player] Using minimal fallback item (still loading)",
      );
      return {
        Id: contentId,
        Name: metadata?.title || "Unknown",
        Type: "Movie", // Temporary until API fetch completes
        ServerId: "",
      } as BaseItemDto;
    }

    return null;
  }, [fetchedItem, mediaStatus?.mediaInfo]);

  // Derive state from raw Chromecast hooks
  const protocol: CastProtocol = "chromecast";
  const progress = liveProgress; // Use live-updating progress
  const duration = mediaStatus?.mediaInfo?.streamDuration ?? 0;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;
  const isBuffering = mediaStatus?.playerState === MediaPlayerState.BUFFERING;
  const currentDevice = castDevice?.friendlyName ?? null;

  // Only use casting controls if we have a current item to avoid "No session" errors
  const castingControls = useCasting(currentItem);
  const {
    togglePlayPause,
    skipForward,
    skipBackward,
    stop,
    setVolume,
    volume,
    remoteMediaClient,
  } = currentItem
    ? castingControls
    : {
        togglePlayPause: async () => {},
        skipForward: async () => {},
        skipBackward: async () => {},
        stop: async () => {},
        setVolume: async () => {},
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
  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1.0);

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
        console.log(
          `[Casting Player] Fetching season data for SeasonId: ${currentItem.SeasonId}`,
        );
        const userLibraryApi = getUserLibraryApi(api);
        const response = await userLibraryApi.getItem({
          itemId: currentItem.SeasonId!,
          userId: user.Id!,
        });
        console.log("[Casting Player] Season data fetched:", {
          Id: response.data.Id,
          Name: response.data.Name,
          ImageTags: response.data.ImageTags,
          ParentPrimaryImageItemId: response.data.ParentPrimaryImageItemId,
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
        `${stream.Language || "Unknown"}${stream.IsForced ? " (Forced)" : ""}${stream.Title ? ` - ${stream.Title}` : ""}`,
      codec: stream.Codec || "Unknown",
      isForced: stream.IsForced || false,
      isExternal: stream.IsExternal || false,
    }));
  }, [currentItem?.MediaStreams]);

  const availableMediaSources = useMemo(() => {
    // Get the original source bitrate
    const originalBitrate =
      currentItem?.MediaSources?.[0]?.Bitrate ||
      currentItem?.MediaStreams?.find((s) => s.Type === "Video")?.BitRate ||
      20000000; // Default to 20Mbps if unknown

    // Generate bitrate variants
    const variants = [
      {
        id: `${currentItem?.Id}-max`,
        name: "Max",
        bitrate: originalBitrate,
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
  }, [currentItem?.MediaSources, currentItem?.MediaStreams, currentItem?.Id]);

  // Auto-select stereo audio track for better Chromecast compatibility
  useEffect(() => {
    if (!remoteMediaClient || !mediaStatus?.mediaInfo) return;

    const currentTrack = availableAudioTracks.find(
      (t) => t.index === selectedAudioTrackIndex,
    );

    // If current track is 5.1+ audio, try to switch to stereo
    if (currentTrack && (currentTrack.channels || 0) > 2) {
      const stereoTrack = availableAudioTracks.find((t) => t.channels === 2);
      if (stereoTrack && stereoTrack.index !== selectedAudioTrackIndex) {
        console.log(
          "[Audio] Switching from 5.1 to stereo for better compatibility:",
          currentTrack.displayTitle,
          "->",
          stereoTrack.displayTitle,
        );
        setSelectedAudioTrackIndex(stereoTrack.index);
        remoteMediaClient
          .setActiveTrackIds([stereoTrack.index])
          .catch(console.error);
      }
    }
  }, [mediaStatus?.mediaInfo, availableAudioTracks, remoteMediaClient]);

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

  // Auto-navigate to player when casting starts (if not already on player screen)
  useEffect(() => {
    if (mediaStatus?.currentItemId && !currentItem) {
      // New media started casting while we're not on the player
      console.log("[Casting Player] Auto-navigating to player for new cast");
      router.replace("/casting-player" as any);
    }
  }, [mediaStatus?.currentItemId, currentItem, router]);

  // Segment detection (skip intro/credits) - use progress in seconds for accurate detection
  const { currentSegment, skipIntro, skipCredits, skipSegment } =
    useChromecastSegments(currentItem, progress * 1000, false);

  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  // Progress bar swipe gesture
  const progressGestureContext = useSharedValue({ startValue: 0 });
  const isSeeking = useSharedValue(false);

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
            runOnJS(dismissModal)();
          },
        );
      } else {
        // Spring back to position
        translateY.value = withSpring(0);
      }
    });

  // Progress bar pan gesture for seeking
  const progressPanGesture = Gesture.Pan()
    .onBegin(() => {
      isSeeking.value = true;
      progressGestureContext.value = { startValue: liveProgress };
    })
    .onUpdate((event) => {
      if (!duration) return;
      // Calculate seek delta based on screen width (more sensitive)
      const deltaSeconds = event.translationX / 5; // Adjust sensitivity
      const newPosition = Math.max(
        0,
        Math.min(
          duration,
          progressGestureContext.value.startValue + deltaSeconds,
        ),
      );
      // Update live progress for immediate UI feedback (must use runOnJS)
      runOnJS(setLiveProgress)(newPosition);
    })
    .onEnd((event) => {
      isSeeking.value = false;
      // Calculate final position from gesture context
      if (remoteMediaClient && duration) {
        const deltaSeconds = event.translationX / 5;
        const finalPosition = Math.max(
          0,
          Math.min(
            duration,
            progressGestureContext.value.startValue + deltaSeconds,
          ),
        );
        // Use runOnJS to call the async function
        runOnJS((pos: number) => {
          remoteMediaClient.seek({ position: pos }).catch((error) => {
            console.error("[Casting Player] Seek error:", error);
          });
        })(finalPosition);
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
      console.log(
        `[Casting Player] Using season poster for ${seasonData.Name}`,
        { imageItemId, seasonImageTag },
      );
      return seasonImageTag
        ? `${api.basePath}/Items/${imageItemId}/Images/Primary?fillHeight=450&fillWidth=300&quality=96&tag=${seasonImageTag}`
        : `${api.basePath}/Items/${imageItemId}/Images/Primary?fillHeight=450&fillWidth=300&quality=96`;
    }

    // Fallback to item poster for non-episodes or if season data not loaded
    console.log(
      `[Casting Player] Using fallback poster for ${currentItem.Name}`,
      {
        Type: currentItem.Type,
        hasSeasonData: !!seasonData?.Id,
      },
    );
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

  const progressPercent = useMemo(
    () => (duration > 0 ? (progress / duration) * 100 : 0),
    [progress, duration],
  );

  const protocolColor = "#a855f7"; // Streamyfin purple

  const _showNextEpisode = useMemo(() => {
    if (currentItem?.Type !== "Episode" || !nextEpisode) return false;
    const remaining = duration - progress;
    return shouldShowNextEpisodeCountdown(remaining, true, 30);
  }, [currentItem?.Type, nextEpisode, duration, progress]);

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
  }, [castState]);

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
  }, [castState, mediaStatus]);

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
          Connecting to Chromecast...
        </Text>
      </View>
    );
  }

  // Don't render if not connected or no media playing
  if (castState !== CastState.CONNECTED || !mediaStatus || !currentItem) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
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
                {currentDevice || "Unknown Device"}
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
                fontSize: 25,
                fontWeight: "700",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              {truncateTitle(currentItem.Name || "Unknown", 50)}
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
                  width: 280,
                  height: 420,
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
                      {currentSegment.type === "intro"
                        ? t("player.skip_intro")
                        : currentSegment.type === "credits"
                          ? t("player.skip_outro")
                          : `Skip ${currentSegment.type}`}
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
                  if (currentIndex > 0 && remoteMediaClient) {
                    const previousEp = episodes[currentIndex - 1];
                    console.log("Previous episode:", previousEp.Name);
                  }
                }}
                disabled={
                  episodes.findIndex((ep) => ep.Id === currentItem.Id) === 0
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
                    episodes.findIndex((ep) => ep.Id === currentItem.Id) === 0
                      ? 0.4
                      : 1,
                }}
              >
                <Ionicons name='play-skip-back' size={22} color='white' />
              </Pressable>

              {/* Next episode button */}
              <Pressable
                onPress={async () => {
                  if (nextEpisode && remoteMediaClient) {
                    console.log("Next episode:", nextEpisode.Name);
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

              {/* Stop casting button */}
              <Pressable
                onPress={async () => {
                  try {
                    // End the casting session and stop the receiver
                    const sessionManager = GoogleCast.getSessionManager();
                    await sessionManager.endCurrentSession(true);

                    // Navigate back
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace("/(auth)/(tabs)/(home)/");
                    }
                  } catch (error) {
                    console.error(
                      "[Casting Player] Error disconnecting:",
                      error,
                    );
                    // Try to navigate anyway
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
            {/* Progress slider - interactive with pan gesture and tap */}
            <View style={{ marginBottom: 16, marginTop: 8 }}>
              <GestureDetector gesture={progressPanGesture}>
                <Pressable
                  onPress={(e) => {
                    if (!remoteMediaClient || !duration) return;
                    // Get the layout to calculate percentage
                    e.currentTarget.measure(
                      (_x, _y, width, _height, pageX, _pageY) => {
                        const touchX = e.nativeEvent.pageX - pageX;
                        const percentage = Math.max(
                          0,
                          Math.min(1, touchX / width),
                        );
                        const newPosition = percentage * duration;
                        remoteMediaClient
                          .seek({ position: newPosition })
                          .catch(console.error);
                      },
                    );
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      backgroundColor: "#333",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        height: "100%",
                        width: `${progressPercent}%`,
                        backgroundColor: protocolColor,
                      }}
                    />
                  </View>
                </Pressable>
              </GestureDetector>
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
                Ending at{" "}
                {calculateEndingTime(progress * 1000, duration * 1000)}
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
                {settings?.rewindSkipTime && (
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
                {settings?.forwardSkipTime && (
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
            visible={showDeviceSheet && protocol === "chromecast"}
            onClose={() => setShowDeviceSheet(false)}
            device={
              currentDevice && protocol === "chromecast" && castDevice
                ? ({
                    deviceId: castDevice.deviceId,
                    friendlyName: currentDevice,
                  } as any)
                : null
            }
            onDisconnect={async () => {
              try {
                await stop();
                setShowDeviceSheet(false);
                // Close player immediately after stopping
                setTimeout(() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace("/(auth)/(tabs)/(home)/");
                  }
                }, 100);
              } catch (error) {
                console.error("[Casting Player] Error stopping:", error);
              }
            }}
            volume={volume}
            onVolumeChange={async (vol) => {
              setVolume(vol);
            }}
          />

          <ChromecastEpisodeList
            visible={showEpisodeList}
            onClose={() => setShowEpisodeList(false)}
            currentItem={currentItem}
            episodes={episodes}
            api={api}
            onSelectEpisode={(episode) => {
              // TODO: Load new episode - requires casting new media
              console.log("Selected episode:", episode.Name);
              setShowEpisodeList(false);
            }}
          />

          <ChromecastSettingsMenu
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            item={currentItem}
            mediaSources={availableMediaSources.filter((source) => {
              const currentBitrate =
                availableMediaSources[0]?.bitrate || Number.POSITIVE_INFINITY;
              return (source.bitrate || 0) <= currentBitrate;
            })}
            selectedMediaSource={availableMediaSources[0] || null}
            onMediaSourceChange={(source) => {
              // TODO: Requires reloading media with new source URL
              console.log("Changed media source:", source);
            }}
            audioTracks={availableAudioTracks}
            selectedAudioTrack={
              selectedAudioTrackIndex !== null
                ? availableAudioTracks.find(
                    (t) => t.index === selectedAudioTrackIndex,
                  ) || null
                : availableAudioTracks[0] || null
            }
            onAudioTrackChange={(track) => {
              setSelectedAudioTrackIndex(track.index);
              // Set active tracks using RemoteMediaClient
              remoteMediaClient
                ?.setActiveTrackIds([track.index])
                .catch(console.error);
            }}
            subtitleTracks={availableSubtitleTracks}
            selectedSubtitleTrack={
              selectedSubtitleTrackIndex !== null
                ? availableSubtitleTracks.find(
                    (t) => t.index === selectedSubtitleTrackIndex,
                  ) || null
                : null
            }
            onSubtitleTrackChange={(track) => {
              setSelectedSubtitleTrackIndex(track?.index ?? null);
              if (track) {
                remoteMediaClient
                  ?.setActiveTrackIds([track.index])
                  .catch(console.error);
              } else {
                // Disable subtitles
                remoteMediaClient?.setActiveTrackIds([]).catch(console.error);
              }
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
