/**
 * Unified Casting Player Modal
 * Protocol-agnostic full-screen player for all supported casting protocols
 */

import { router, Stack } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
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
import { BITRATES } from "@/components/BitrateSelector";
import { CastPlayerEpisodeControls } from "@/components/casting/player/CastPlayerEpisodeControls";
import { CastPlayerHeader } from "@/components/casting/player/CastPlayerHeader";
import { CastPlayerPoster } from "@/components/casting/player/CastPlayerPoster";
import { CastPlayerProgressBar } from "@/components/casting/player/CastPlayerProgressBar";
import { CastPlayerTitle } from "@/components/casting/player/CastPlayerTitle";
import { CastPlayerTransportControls } from "@/components/casting/player/CastPlayerTransportControls";
import { ChromecastDeviceSheet } from "@/components/chromecast/ChromecastDeviceSheet";
import { ChromecastEpisodeList } from "@/components/chromecast/ChromecastEpisodeList";
import { ChromecastSettingsMenu } from "@/components/chromecast/ChromecastSettingsMenu";
import { useChromecastSegments } from "@/components/chromecast/hooks/useChromecastSegments";
import { Text } from "@/components/common/Text";
import { useCastEpisodes } from "@/hooks/useCastEpisodes";
import { useCasting } from "@/hooks/useCasting";
import { useCastPlayerItem } from "@/hooks/useCastPlayerItem";
import { useCastSelection } from "@/hooks/useCastSelection";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { detectCapabilities } from "@/utils/casting/capabilities";
import { loadCastMedia } from "@/utils/casting/castLoad";
import { getPosterUrl } from "@/utils/casting/helpers";
import { resolveSelection } from "@/utils/casting/selection";
import type { CastSelection } from "@/utils/casting/types";

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

  // Last stable playback position (seconds), for resuming across reloads.
  const resumePositionRef = useRef(0);

  // Fetch full item data from Jellyfin by ID and derive the effective item
  const { fetchedItem, currentItem } = useCastPlayerItem({
    api,
    user,
    mediaStatus,
  });

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

  // Track the last stable position so a reload mid-switch resumes correctly.
  useEffect(() => {
    const pos = mediaStatus?.streamPosition ?? 0;
    if (mediaStatus?.playerState === MediaPlayerState.PLAYING && pos > 0) {
      resumePositionRef.current = pos;
    }
  }, [mediaStatus?.streamPosition, mediaStatus?.playerState]);

  // Derive state from raw Chromecast hooks
  const progress = liveProgress; // Use live-updating progress
  const duration = mediaStatus?.mediaInfo?.streamDuration ?? 0;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;
  const isBuffering = mediaStatus?.playerState === MediaPlayerState.BUFFERING;
  const currentDevice = castDevice?.friendlyName ?? null;

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

  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1);

  // Reload the cast stream with a full selection; resolves true on success.
  const reloadWithSelection = useCallback(
    async (selection: CastSelection): Promise<boolean> => {
      if (!api || !user?.Id || !currentItem?.Id || !remoteMediaClient) {
        console.warn("[Casting Player] Cannot reload - missing required data");
        return false;
      }
      const currentPosition = resumePositionRef.current;
      const result = await loadCastMedia({
        client: remoteMediaClient,
        device: castDevice,
        api,
        item: currentItem,
        userId: user.Id,
        profileMode: settings.chromecastProfile,
        maxBitrateSetting: settings.chromecastMaxBitrate,
        options: {
          mediaSourceId: selection.mediaSourceId,
          audioStreamIndex: selection.audioStreamIndex,
          subtitleStreamIndex: selection.subtitleStreamIndex,
          maxBitrate: selection.maxBitrate,
          startPositionMs: currentPosition * 1000,
        },
      });
      if (!result.ok) {
        console.error(
          "[Casting Player] Failed to reload stream:",
          result.error,
        );
        return false;
      }
      return true;
    },
    [
      api,
      user?.Id,
      currentItem,
      remoteMediaClient,
      castDevice,
      settings.chromecastProfile,
      settings.chromecastMaxBitrate,
    ],
  );

  const { currentSelection, applySelection } = useCastSelection({
    currentItem,
    mediaStatus,
    reload: reloadWithSelection,
  });

  // Episode/season cluster: episode list, next episode, season data, loader
  const { episodes, nextEpisode, seasonData, loadEpisode } = useCastEpisodes({
    api,
    user,
    currentItem,
    remoteMediaClient,
    castDevice,
    settings,
  });

  // The MediaSource currently selected, for deriving its tracks.
  // Derived from fetchedItem: the slim cast-customData item strips per-source
  // MediaStreams, so only the full fetched item yields correct track lists.
  const selectedSource = useMemo(
    () =>
      fetchedItem?.MediaSources?.find(
        (s) => s.Id === currentSelection?.mediaSourceId,
      ) ??
      fetchedItem?.MediaSources?.[0] ??
      null,
    [fetchedItem?.MediaSources, currentSelection?.mediaSourceId],
  );

  // Real alternate versions (multi-version items).
  const availableVersions = useMemo(
    () =>
      (fetchedItem?.MediaSources ?? []).map((s, i) => ({
        id: s.Id ?? `source-${i}`,
        name: s.Name || `${t("casting_player.version")} ${i + 1}`,
      })),
    [fetchedItem?.MediaSources, t],
  );

  // Quality tiers from the shared ladder, capped to BOTH the device's
  // capability and the media's own bitrate — a tier above either ceiling
  // would behave identically to "Max", so it is not offered.
  const availableQualities = useMemo(() => {
    const caps = detectCapabilities(castDevice, {
      profileMode: settings.chromecastProfile,
      maxBitrate: settings.chromecastMaxBitrate,
    });
    const mediaBitrate =
      selectedSource?.Bitrate ??
      fetchedItem?.MediaStreams?.find((s) => s.Type === "Video")?.BitRate ??
      Number.POSITIVE_INFINITY;
    const ceiling = Math.min(caps.maxVideoBitrate, mediaBitrate);
    return BITRATES.filter((b) => b.value === undefined || b.value <= ceiling);
  }, [
    castDevice,
    settings.chromecastProfile,
    settings.chromecastMaxBitrate,
    selectedSource,
    fetchedItem?.MediaStreams,
  ]);

  const availableAudioTracks = useMemo(() => {
    const streams = selectedSource?.MediaStreams ?? fetchedItem?.MediaStreams;
    if (!streams) return [];
    return streams
      .filter((stream) => stream.Type === "Audio")
      .map((stream) => ({
        index: stream.Index ?? 0,
        language: stream.Language || "Unknown",
        displayTitle:
          stream.DisplayTitle ||
          `${stream.Language || "Unknown"} ${stream.Codec || ""}`.trim(),
        codec: stream.Codec || "Unknown",
        channels: stream.Channels,
        bitrate: stream.BitRate,
      }));
  }, [selectedSource, fetchedItem?.MediaStreams]);

  const availableSubtitleTracks = useMemo(() => {
    const streams = selectedSource?.MediaStreams ?? fetchedItem?.MediaStreams;
    if (!streams) return [];
    return streams
      .filter((stream) => stream.Type === "Subtitle")
      .map((stream) => ({
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
  }, [selectedSource, fetchedItem?.MediaStreams]);

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
            runOnJS(dismissModal)();
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
          <CastPlayerHeader
            insetTop={insets.top}
            protocolColor={protocolColor}
            currentDevice={currentDevice}
            t={t}
            onDismiss={dismissModal}
            onPressConnectionIndicator={() => setShowDeviceSheet(true)}
            onPressSettings={() => setShowSettings(true)}
          />

          {/* Title Area */}
          <CastPlayerTitle
            insetTop={insets.top}
            currentItem={currentItem}
            t={t}
          />

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
            <CastPlayerPoster
              posterUrl={posterUrl}
              isBuffering={isBuffering}
              currentSegment={currentSegment}
              skipIntro={skipIntro}
              skipCredits={skipCredits}
              skipSegment={skipSegment}
              remoteMediaClient={remoteMediaClient}
              mediaStatus={mediaStatus}
              protocolColor={protocolColor}
              t={t}
            />
          </ScrollView>

          {/* Fixed 4-button control row for episodes - positioned independently */}
          {currentItem.Type === "Episode" && (
            <CastPlayerEpisodeControls
              insetBottom={insets.bottom}
              currentItemId={currentItem.Id}
              episodes={episodes}
              nextEpisode={nextEpisode}
              remoteMediaClient={remoteMediaClient}
              onPressEpisodes={() => setShowEpisodeList(true)}
              loadEpisode={loadEpisode}
              router={router}
            />
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
            {/* Progress slider with trickplay preview + time display */}
            <CastPlayerProgressBar
              sliderProgress={sliderProgress}
              sliderMin={sliderMin}
              sliderMax={sliderMax}
              isScrubbing={isScrubbing}
              scrubPercentage={scrubPercentage}
              setScrubPercentage={setScrubPercentage}
              trickplayTime={trickplayTime}
              setTrickplayTime={setTrickplayTime}
              trickPlayUrl={trickPlayUrl}
              calculateTrickplayUrl={calculateTrickplayUrl}
              trickplayInfo={trickplayInfo}
              progress={progress}
              duration={duration}
              remoteMediaClient={remoteMediaClient}
              protocolColor={protocolColor}
              t={t}
            />

            {/* Playback controls */}
            <CastPlayerTransportControls
              isPlaying={isPlaying}
              togglePlayPause={togglePlayPause}
              skipBackward={skipBackward}
              skipForward={skipForward}
              rewindSkipTime={settings?.rewindSkipTime}
              forwardSkipTime={settings?.forwardSkipTime}
              protocolColor={protocolColor}
            />
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
            versions={availableVersions}
            selectedVersionId={currentSelection?.mediaSourceId ?? ""}
            onVersionChange={(id) => {
              if (!fetchedItem) return;
              applySelection({
                ...resolveSelection(fetchedItem, { mediaSourceId: id }),
                maxBitrate: currentSelection?.maxBitrate,
              });
            }}
            qualities={availableQualities}
            selectedMaxBitrate={currentSelection?.maxBitrate}
            onQualityChange={(value) => applySelection({ maxBitrate: value })}
            audioTracks={availableAudioTracks}
            selectedAudioIndex={currentSelection?.audioStreamIndex ?? -1}
            onAudioChange={(index) =>
              applySelection({ audioStreamIndex: index })
            }
            subtitleTracks={availableSubtitleTracks}
            selectedSubtitleIndex={currentSelection?.subtitleStreamIndex ?? -1}
            onSubtitleChange={(index) =>
              applySelection({ subtitleStreamIndex: index })
            }
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
