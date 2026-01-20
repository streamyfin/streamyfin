/**
 * Unified Casting Player Modal
 * Protocol-agnostic full-screen player for all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  calculateEndingTime,
  formatTime,
  getPosterUrl,
  getProtocolIcon,
  getProtocolName,
  shouldShowNextEpisodeCountdown,
  truncateTitle,
} from "@/utils/casting/helpers";

export default function CastingPlayerScreen() {
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);

  const {
    isConnected,
    protocol,
    currentItem,
    currentDevice,
    progress,
    duration,
    isPlaying,
    isBuffering,
    togglePlayPause,
    skipForward,
    skipBackward,
    stop,
    setVolume,
    volume,
    remoteMediaClient,
    seek,
  } = useCasting(null);

  // Modal states
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [showDeviceSheet, setShowDeviceSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [episodes, setEpisodes] = useState<BaseItemDto[]>([]);
  const [nextEpisode, setNextEpisode] = useState<BaseItemDto | null>(null);

  const availableAudioTracks = useMemo(() => {
    // TODO: Parse from mediaInfo.mediaTracks or currentItem.MediaStreams
    return [];
  }, []);

  const availableSubtitleTracks = useMemo(() => {
    // TODO: Parse from mediaInfo.mediaTracks or currentItem.MediaStreams
    return [];
  }, []);

  const availableMediaSources = useMemo(() => {
    // TODO: Get from currentItem.MediaSources
    return [];
  }, []);

  // Fetch episodes for TV shows
  useEffect(() => {
    if (currentItem?.Type !== "Episode" || !currentItem.SeriesId || !api)
      return;

    const fetchEpisodes = async () => {
      try {
        const tvShowsApi = getTvShowsApi(api);
        const response = await tvShowsApi.getEpisodes({
          seriesId: currentItem.SeriesId!,
          seasonId: currentItem.SeasonId || undefined,
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

  // Segment detection (skip intro/credits)
  const { currentSegment, skipIntro, skipCredits, skipSegment } =
    useChromecastSegments(currentItem, progress, false);

  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  const dismissModal = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100) {
        translateY.value = withSpring(500, {}, () => {
          runOnJS(dismissModal)();
        });
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Memoize expensive calculations (before early return)
  const posterUrl = useMemo(
    () =>
      getPosterUrl(
        api?.basePath,
        currentItem?.Id,
        currentItem?.ImageTags?.Primary,
        300,
        450,
      ),
    [api?.basePath, currentItem?.Id, currentItem?.ImageTags?.Primary],
  );

  const progressPercent = useMemo(
    () => (duration > 0 ? (progress / duration) * 100 : 0),
    [progress, duration],
  );

  const protocolColor = useMemo(
    () => (protocol === "chromecast" ? "#F9AB00" : "#666"), // Google yellow
    [protocol],
  );

  const protocolIcon = useMemo(
    () => (protocol ? getProtocolIcon(protocol) : ("tv" as const)),
    [protocol],
  );

  const protocolName = useMemo(
    () => (protocol ? getProtocolName(protocol) : "Unknown"),
    [protocol],
  );

  const showNextEpisode = useMemo(() => {
    if (currentItem?.Type !== "Episode" || !nextEpisode) return false;
    const remaining = duration - progress;
    return shouldShowNextEpisodeCountdown(remaining, true, 30);
  }, [currentItem?.Type, nextEpisode, duration, progress]);

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected || !currentItem || !protocol) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(auth)/(tabs)/(home)/");
      }
    }
  }, [isConnected, currentItem, protocol]);

  // Don't render if not connected
  if (!isConnected || !currentItem || !protocol) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: "#000",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
          animatedStyle,
        ]}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 32,
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
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                {protocolName}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowSettings(true)}
              style={{ padding: 8, marginRight: -8 }}
            >
              <Ionicons name='settings-outline' size={24} color='white' />
            </Pressable>
          </View>

          {/* Title and episode info */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: "white",
                fontSize: 28,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {truncateTitle(currentItem.Name || "Unknown", 50)}
            </Text>
            {currentItem.SeriesName && (
              <Text
                style={{
                  color: "#999",
                  fontSize: 16,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                {currentItem.SeriesName}
                {currentItem.ParentIndexNumber &&
                  currentItem.IndexNumber &&
                  ` • S${currentItem.ParentIndexNumber}:E${currentItem.IndexNumber}`}
              </Text>
            )}
          </View>

          {/* Poster with buffering overlay */}
          <View
            style={{
              alignItems: "center",
              marginBottom: 32,
            }}
          >
            <View
              style={{
                width: 300,
                height: 450,
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
                    backdropFilter: "blur(10px)",
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
                    Buffering...
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Device info */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 32,
            }}
          >
            <Ionicons name={protocolIcon} size={20} color={protocolColor} />
            <Text style={{ color: protocolColor, fontSize: 15 }}>
              {currentDevice?.name || protocolName}
            </Text>
          </View>

          {/* Progress slider */}
          <View style={{ marginBottom: 12 }}>
            <Pressable
              onPress={(e) => {
                // Calculate tap position and seek
                const { locationX } = e.nativeEvent;
                // Get width from event target
                const width = (
                  e.currentTarget as unknown as { offsetWidth: number }
                ).offsetWidth;
                if (width > 0) {
                  const percent = locationX / width;
                  const newPosition = duration * percent;
                  seek(newPosition);
                }
              }}
            >
              <View
                style={{
                  height: 4,
                  backgroundColor: "#333",
                  borderRadius: 2,
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
          </View>

          {/* Time display */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 32,
            }}
          >
            <Text style={{ color: "#999", fontSize: 13 }}>
              {formatTime(progress)}
            </Text>
            <Text style={{ color: "#999", fontSize: 13 }}>
              Ending at {calculateEndingTime(progress, duration)}
            </Text>
            <Text style={{ color: "#999", fontSize: 13 }}>
              {formatTime(duration)}
            </Text>
          </View>

          {/* Segment skip button (intro/credits) */}
          {currentSegment && (
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  if (!remoteMediaClient) return;
                  // Create seek function wrapper for remote media client
                  const seekFn = (positionMs: number) =>
                    remoteMediaClient.seek({ position: positionMs / 1000 });

                  if (currentSegment.type === "intro") {
                    skipIntro(seekFn);
                  } else if (currentSegment.type === "credits") {
                    skipCredits(seekFn);
                  } else {
                    skipSegment(seekFn);
                  }
                }}
                style={{
                  backgroundColor: protocolColor,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name='play-skip-forward' size={20} color='white' />
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "600" }}
                >
                  Skip{" "}
                  {currentSegment.type.charAt(0).toUpperCase() +
                    currentSegment.type.slice(1)}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Next episode countdown */}
          {showNextEpisode && nextEpisode && (
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: "#1a1a1a",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <ActivityIndicator size='small' color={protocolColor} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontSize: 14, fontWeight: "600" }}
                  >
                    Next: {nextEpisode.Name}
                  </Text>
                  <Text style={{ color: "#999", fontSize: 12, marginTop: 2 }}>
                    Starting in {Math.ceil((duration - progress) / 1000)}s
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setNextEpisode(null); // Cancel auto-play
                  }}
                  style={{ marginLeft: 8 }}
                >
                  <Ionicons name='close-circle' size={24} color='#999' />
                </Pressable>
              </View>
            </View>
          )}

          {/* Playback controls */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 32,
              marginBottom: 48,
            }}
          >
            {/* Rewind 10s */}
            <Pressable onPress={() => skipBackward(10)} style={{ padding: 16 }}>
              <Ionicons name='play-back' size={32} color='white' />
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

            {/* Forward 10s */}
            <Pressable onPress={() => skipForward(10)} style={{ padding: 16 }}>
              <Ionicons name='play-forward' size={32} color='white' />
            </Pressable>
          </View>

          {/* Stop casting button */}
          <Pressable
            onPress={stop}
            style={{
              backgroundColor: "#1a1a1a",
              padding: 16,
              borderRadius: 12,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <Ionicons name='stop-circle-outline' size={20} color='#FF3B30' />
            <Text style={{ color: "#FF3B30", fontSize: 16, fontWeight: "600" }}>
              Stop Casting
            </Text>
          </Pressable>

          {/* Episode list button (for TV shows) */}
          {currentItem.Type === "Episode" && (
            <Pressable
              onPress={() => setShowEpisodeList(true)}
              style={{
                backgroundColor: "#1a1a1a",
                padding: 16,
                borderRadius: 12,
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                marginBottom: 24,
              }}
            >
              <Ionicons name='list' size={20} color='white' />
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                Episodes
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Modals */}
        <ChromecastDeviceSheet
          visible={showDeviceSheet && protocol === "chromecast"}
          onClose={() => setShowDeviceSheet(false)}
          device={
            currentDevice && protocol === "chromecast"
              ? ({
                  deviceId: currentDevice.id,
                  friendlyName: currentDevice.name,
                } as any)
              : null
          }
          onDisconnect={stop}
          volume={volume}
          onVolumeChange={async (vol) => setVolume(vol)}
        />

        <ChromecastEpisodeList
          visible={showEpisodeList}
          onClose={() => setShowEpisodeList(false)}
          currentItem={currentItem}
          episodes={episodes}
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
          mediaSources={availableMediaSources}
          selectedMediaSource={null}
          onMediaSourceChange={(source) => {
            // TODO: Requires reloading media with new source URL
            console.log("Changed media source:", source);
          }}
          audioTracks={availableAudioTracks}
          selectedAudioTrack={null}
          onAudioTrackChange={(track) => {
            // Set active tracks using RemoteMediaClient
            remoteMediaClient
              ?.setActiveTrackIds([track.index])
              .catch(console.error);
          }}
          subtitleTracks={availableSubtitleTracks}
          selectedSubtitleTrack={null}
          onSubtitleTrackChange={(track) => {
            if (track) {
              remoteMediaClient
                ?.setActiveTrackIds([track.index])
                .catch(console.error);
            } else {
              // Disable subtitles
              remoteMediaClient?.setActiveTrackIds([]).catch(console.error);
            }
          }}
          playbackSpeed={1.0}
          onPlaybackSpeedChange={(speed) => {
            remoteMediaClient?.setPlaybackRate(speed).catch(console.error);
          }}
          showTechnicalInfo={false}
          onToggleTechnicalInfo={() => {
            // TODO: Show/hide technical info section
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}
