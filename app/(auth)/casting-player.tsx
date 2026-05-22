/**
 * Unified Casting Player Modal
 * Protocol-agnostic full-screen player for all supported casting protocols
 */

import { router, Stack } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import GoogleCast, {
  CastState,
  MediaPlayerState,
  useCastDevice,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import Animated from "react-native-reanimated";
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
import { useCastDismissGesture } from "@/hooks/useCastDismissGesture";
import { useCastEpisodes } from "@/hooks/useCastEpisodes";
import { useCasting } from "@/hooks/useCasting";
import { useCastPlayerItem } from "@/hooks/useCastPlayerItem";
import { useCastPlayerProgress } from "@/hooks/useCastPlayerProgress";
import { useCastSelection } from "@/hooks/useCastSelection";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { detectCapabilities } from "@/utils/casting/capabilities";
import { loadCastMedia } from "@/utils/casting/castLoad";
import { getPosterUrl } from "@/utils/casting/helpers";
import { resolveSelection } from "@/utils/casting/selection";
import type { CastSelection } from "@/utils/casting/types";
import {
  type PlaybackController,
  useRegisterPlaybackController,
} from "@/utils/playback/playbackController";

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

  // Fetch full item data from Jellyfin by ID and derive the effective item
  const { fetchedItem, currentItem } = useCastPlayerItem({
    api,
    user,
    mediaStatus,
  });

  // Derive state from raw Chromecast hooks
  const duration = mediaStatus?.mediaInfo?.streamDuration ?? 0;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;
  const isBuffering = mediaStatus?.playerState === MediaPlayerState.BUFFERING;
  const currentDevice = castDevice?.friendlyName ?? null;

  // Progress/slider/trickplay cluster: slider shared values, scrub state,
  // live-progress interpolation, resume-position tracking, trickplay preview.
  const {
    sliderProgress,
    sliderMin,
    sliderMax,
    isScrubbing,
    trickplayTime,
    setTrickplayTime,
    scrubPercentage,
    setScrubPercentage,
    progress,
    resumePositionRef,
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
  } = useCastPlayerProgress({ mediaStatus, fetchedItem, duration });

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
  const { episodes, nextEpisode, seasonData, loadEpisode, loadingEpisodeId } =
    useCastEpisodes({
      api,
      user,
      currentItem,
      remoteMediaClient,
      castDevice,
      settings,
    });

  // True while a `loadEpisode` is in flight and `currentItem` (derived from the
  // cast customData) still describes the previous episode. Used to suppress
  // episode-dependent secondary UI that would otherwise flash stale data.
  const isEpisodeTransitioning =
    loadingEpisodeId != null && loadingEpisodeId !== currentItem?.Id;

  // Expose this player to the app-wide remote-control surface while a cast
  // session is connected. The individual useCasting methods are each
  // useCallback-wrapped and stable, so depend on them directly rather than on
  // the whole `castingControls` object literal (rebuilt every render).
  const {
    togglePlayPause: castTogglePlayPause,
    pause: castPause,
    play: castPlay,
    stop: castStop,
    seek: castSeek,
    setVolume: castSetVolume,
  } = castingControls;
  // toggleMute reads the latest volume without making `volume` a useMemo dep.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const castController = useMemo<PlaybackController>(
    () => ({
      playPause: () => {
        castTogglePlayPause();
      },
      pause: () => {
        castPause();
      },
      unpause: () => {
        castPlay();
      },
      stop: () => {
        castStop();
      },
      seek: (positionMs) => {
        castSeek(positionMs);
      },
      next: () => {
        if (nextEpisode) loadEpisode(nextEpisode);
      },
      previous: () => {
        const idx = episodes.findIndex((e) => e.Id === currentItem?.Id);
        if (idx > 0) loadEpisode(episodes[idx - 1]);
      },
      setVolume: (level) => {
        castSetVolume(level);
      },
      toggleMute: () => {
        castSetVolume(volumeRef.current > 0 ? 0 : 1);
      },
    }),
    [
      castTogglePlayPause,
      castPause,
      castPlay,
      castStop,
      castSeek,
      castSetVolume,
      episodes,
      nextEpisode,
      loadEpisode,
      currentItem?.Id,
    ],
  );

  useRegisterPlaybackController(
    castController,
    castState === CastState.CONNECTED,
  );

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
  const { panGesture, animatedStyle, dismissModal } = useCastDismissGesture({
    router,
  });

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

          {/* Title Area — hidden during an episode change to avoid flashing
              the previous episode's title/season-episode numbers. */}
          {!isEpisodeTransitioning && (
            <CastPlayerTitle
              insetTop={insets.top}
              currentItem={currentItem}
              t={t}
            />
          )}

          {/* Scrollable content area */}
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: insets.top + 160,
              paddingBottom: insets.bottom + 500,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Poster with buffering overlay — force the overlay during an
                episode change so the loading state covers the stale poster. */}
            <CastPlayerPoster
              posterUrl={posterUrl}
              isBuffering={isBuffering || isEpisodeTransitioning}
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

          {/* Fixed control row - positioned independently. Episode-specific
              buttons are conditional inside; Stop is always available. */}
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
            audioTracks={isEpisodeTransitioning ? [] : availableAudioTracks}
            selectedAudioIndex={currentSelection?.audioStreamIndex ?? -1}
            onAudioChange={(index) =>
              applySelection({ audioStreamIndex: index })
            }
            subtitleTracks={
              isEpisodeTransitioning ? [] : availableSubtitleTracks
            }
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
