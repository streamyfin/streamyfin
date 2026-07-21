import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { useAtom, useSetAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Alert, Dimensions, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { GenreTags } from "@/components/GenreTags";
import { TVEpisodeList } from "@/components/series/TVEpisodeList";
import {
  TVBackdrop,
  TVButton,
  TVCastCrewText,
  TVCastSection,
  TVFavoriteButton,
  TVMetadataBadges,
  TVOptionButton,
  TVPlayedButton,
  TVProgressBar,
  TVRefreshButton,
  TVSeriesNavigation,
  TVTechnicalDetails,
  TVWatchlistButton,
} from "@/components/tv";
import {
  LOCAL_SUBTITLE_INDEX_START,
  type Track,
} from "@/components/video-player/controls/types";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import { useTVThemeMusic } from "@/hooks/useTVThemeMusic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { useSettings } from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { compareTracksForMenu } from "@/utils/jellyfin/subtitleUtils";
import { formatDuration, runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface ItemContentTVProps {
  item?: BaseItemDto | null;
  itemWithSources?: BaseItemDto | null;
  isLoading?: boolean;
}

// Export as both ItemContentTV (for direct requires) and ItemContent (for platform-resolved imports)
export const ItemContentTV: React.FC<ItemContentTVProps> = React.memo(
  ({ item, itemWithSources }) => {
    const typography = useScaledTVTypography();
    const [api] = useAtom(apiAtom);
    const [user] = useAtom(userAtom);
    const isOffline = useOfflineMode();
    const { settings } = useSettings();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { showItemActions } = useTVItemActionModal();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const _itemColors = useImageColorsReturn({ item });

    // Auto-play theme music (handles fade in/out and cleanup)
    useTVThemeMusic(item?.Id);

    // State for first episode card ref (used for focus guide)
    const [_firstEpisodeRef, setFirstEpisodeRef] = useState<View | null>(null);

    // Fetch season episodes for episodes
    const { data: seasonEpisodes = [] } = useQuery({
      queryKey: ["episodes", item?.SeasonId],
      queryFn: async () => {
        if (!api || !user?.Id || !item?.SeriesId || !item?.SeasonId) return [];
        const res = await getTvShowsApi(api).getEpisodes({
          seriesId: item.SeriesId,
          userId: user.Id,
          seasonId: item.SeasonId,
          enableUserData: true,
          fields: ["MediaSources", "Overview"],
        });
        return res.data.Items || [];
      },
      enabled:
        !!api &&
        !!user?.Id &&
        !!item?.SeriesId &&
        !!item?.SeasonId &&
        item?.Type === "Episode",
    });

    const [selectedOptions, setSelectedOptions] = useState<
      SelectedOptions | undefined
    >(undefined);

    // Enable language preference application for TV
    const playSettingsOptions = useMemo(
      () => ({ applyLanguagePreferences: true }),
      [],
    );

    const {
      defaultAudioIndex,
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
    } = useDefaultPlaySettings(
      itemWithSources ?? item,
      settings,
      playSettingsOptions,
    );

    const logoUrl = useMemo(
      () => (item ? getLogoImageUrlById({ api, item }) : null),
      [api, item],
    );

    // Set default play options
    useEffect(() => {
      setSelectedOptions(() => ({
        bitrate: defaultBitrate,
        mediaSource: defaultMediaSource ?? undefined,
        subtitleIndex: defaultSubtitleIndex ?? -1,
        audioIndex: defaultAudioIndex,
      }));
    }, [
      defaultAudioIndex,
      defaultBitrate,
      defaultSubtitleIndex,
      defaultMediaSource,
    ]);

    const clearShuffleQueue = useSetAtom(shuffleQueueAtom);

    const navigateToPlayer = useCallback(
      (playbackPosition: string) => {
        if (!item || !selectedOptions) return;

        // Starting a normal play cancels any active shuffle queue so a stale
        // queue can't hijack the next-episode order.
        clearShuffleQueue(null);

        const queryParams = new URLSearchParams({
          itemId: item.Id!,
          audioIndex: selectedOptions.audioIndex?.toString() ?? "",
          subtitleIndex: selectedOptions.subtitleIndex?.toString() ?? "",
          mediaSourceId: selectedOptions.mediaSource?.Id ?? "",
          bitrateValue: selectedOptions.bitrate?.value?.toString() ?? "",
          playbackPosition,
          offline: isOffline ? "true" : "false",
        });

        router.push(`/player/direct-player?${queryParams.toString()}`);
      },
      [item, selectedOptions, isOffline, router, clearShuffleQueue],
    );

    const handlePlay = () => {
      if (!item || !selectedOptions) return;

      const hasPlaybackProgress =
        (item.UserData?.PlaybackPositionTicks ?? 0) > 0;

      if (hasPlaybackProgress) {
        Alert.alert(
          t("item_card.resume_playback"),
          t("item_card.resume_playback_description"),
          [
            {
              text: t("common.cancel"),
              style: "cancel",
            },
            {
              text: t("item_card.play_from_start"),
              onPress: () => navigateToPlayer("0"),
            },
            {
              text: t("item_card.continue_from", {
                time: formatDuration(item.UserData?.PlaybackPositionTicks),
              }),
              onPress: () =>
                navigateToPlayer(
                  item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
                ),
              isPreferred: true,
            },
          ],
        );
      } else {
        navigateToPlayer("0");
      }
    };

    // TV Option Modal hook for quality, audio, media source selectors
    const { showOptions } = useTVOptionModal();

    // TV Subtitle Modal hook
    const { showSubtitleModal } = useTVSubtitleModal();

    // State for first actor card ref (used for focus guide)
    const [_firstActorCardRef, setFirstActorCardRef] = useState<View | null>(
      null,
    );

    // Get available audio tracks
    const audioTracks = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Audio",
      );
      return streams ?? [];
    }, [selectedOptions?.mediaSource]);

    // Get available subtitle tracks (raw MediaStream[] for label lookup),
    // ordered like jellyfin-web (embedded first, externals last, forced/default up).
    const subtitleStreams = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      return streams ? [...streams].sort(compareTracksForMenu) : [];
    }, [selectedOptions?.mediaSource]);

    // Store handleSubtitleChange in a ref for stable callback reference
    const handleSubtitleChangeRef = useRef<((index: number) => void) | null>(
      null,
    );

    // State to trigger refresh of local subtitles list
    const [localSubtitlesRefreshKey, setLocalSubtitlesRefreshKey] = useState(0);

    // Convert MediaStream[] to Track[] for the modal (with setTrack callbacks)
    // Also includes locally downloaded subtitles from OpenSubtitles
    const subtitleTracksForModal = useMemo((): Track[] => {
      const tracks: Track[] = subtitleStreams.map((stream) => ({
        name:
          stream.DisplayTitle ||
          `${stream.Language || "Unknown"} (${stream.Codec})`,
        index: stream.Index ?? -1,
        setTrack: () => {
          handleSubtitleChangeRef.current?.(stream.Index ?? -1);
        },
      }));

      // Add locally downloaded subtitles (from OpenSubtitles)
      if (item?.Id) {
        const localSubs = getSubtitlesForItem(item.Id);
        let localIdx = 0;
        for (const localSub of localSubs) {
          // Verify file still exists (cache may have been cleared)
          const subtitleFile = new File(localSub.filePath);
          if (!subtitleFile.exists) {
            continue;
          }

          const localIndex = LOCAL_SUBTITLE_INDEX_START - localIdx;
          tracks.push({
            name: localSub.name,
            index: localIndex,
            isLocal: true,
            localPath: localSub.filePath,
            setTrack: () => {
              // For ItemContent (outside player), just update the selected index
              // The actual subtitle will be loaded when playback starts
              handleSubtitleChangeRef.current?.(localIndex);
            },
          });
          localIdx++;
        }
      }

      return tracks;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtitleStreams, item?.Id, localSubtitlesRefreshKey]);

    // Get available media sources
    const mediaSources = useMemo(() => {
      return (itemWithSources ?? item)?.MediaSources ?? [];
    }, [item, itemWithSources]);

    // Audio options for selector
    const audioOptions: TVOptionItem<number>[] = useMemo(() => {
      return audioTracks.map((track) => ({
        label:
          track.DisplayTitle ||
          `${track.Language || "Unknown"} (${track.Codec})`,
        value: track.Index!,
        selected: track.Index === selectedOptions?.audioIndex,
      }));
    }, [audioTracks, selectedOptions?.audioIndex]);

    // Media source options for selector
    const mediaSourceOptions: TVOptionItem<MediaSourceInfo>[] = useMemo(() => {
      return mediaSources.map((source) => {
        const videoStream = source.MediaStreams?.find(
          (s) => s.Type === "Video",
        );
        const displayName =
          videoStream?.DisplayTitle || source.Name || `Source ${source.Id}`;
        return {
          label: displayName,
          value: source,
          selected: source.Id === selectedOptions?.mediaSource?.Id,
        };
      });
    }, [mediaSources, selectedOptions?.mediaSource?.Id]);

    // Quality/bitrate options for selector
    const qualityOptions: TVOptionItem<Bitrate>[] = useMemo(() => {
      return BITRATES.map((bitrate) => ({
        label: bitrate.key,
        value: bitrate,
        selected: bitrate.value === selectedOptions?.bitrate?.value,
      }));
    }, [selectedOptions?.bitrate?.value]);

    // Handlers for option changes
    const handleAudioChange = useCallback((audioIndex: number) => {
      setSelectedOptions((prev) =>
        prev ? { ...prev, audioIndex } : undefined,
      );
    }, []);

    const handleSubtitleChange = useCallback((subtitleIndex: number) => {
      setSelectedOptions((prev) =>
        prev ? { ...prev, subtitleIndex } : undefined,
      );
    }, []);

    // Keep the ref updated with the latest callback
    handleSubtitleChangeRef.current = handleSubtitleChange;

    const handleMediaSourceChange = useCallback(
      (mediaSource: MediaSourceInfo) => {
        const defaultAudio = mediaSource.MediaStreams?.find(
          (s) => s.Type === "Audio" && s.IsDefault,
        );
        const defaultSubtitle = mediaSource.MediaStreams?.find(
          (s) => s.Type === "Subtitle" && s.IsDefault,
        );
        setSelectedOptions((prev) =>
          prev
            ? {
                ...prev,
                mediaSource,
                audioIndex: defaultAudio?.Index ?? prev.audioIndex,
                subtitleIndex: defaultSubtitle?.Index ?? -1,
              }
            : undefined,
        );
      },
      [],
    );

    const handleQualityChange = useCallback((bitrate: Bitrate) => {
      setSelectedOptions((prev) => (prev ? { ...prev, bitrate } : undefined));
    }, []);

    // Handle server-side subtitle download - invalidate queries to refresh tracks
    const handleServerSubtitleDownloaded = useCallback(() => {
      if (item?.Id) {
        queryClient.invalidateQueries({ queryKey: ["item", item.Id] });
      }
    }, [item?.Id, queryClient]);

    // Handle local subtitle download - trigger refresh of subtitle tracks
    const handleLocalSubtitleDownloaded = useCallback((_path: string) => {
      // Increment the refresh key to trigger re-computation of subtitleTracksForModal
      setLocalSubtitlesRefreshKey((prev) => prev + 1);
    }, []);

    // Refresh subtitle tracks by fetching fresh item data from Jellyfin
    const refreshSubtitleTracks = useCallback(async (): Promise<Track[]> => {
      if (!api || !item?.Id) return [];

      try {
        // Fetch fresh item data with media sources
        const response = await getUserLibraryApi(api).getItem({
          itemId: item.Id,
        });

        const freshItem = response.data;
        const mediaSourceId = selectedOptions?.mediaSource?.Id;

        // Find the matching media source
        const mediaSource = mediaSourceId
          ? freshItem.MediaSources?.find(
              (s: MediaSourceInfo) => s.Id === mediaSourceId,
            )
          : freshItem.MediaSources?.[0];

        // Get subtitle streams from the fresh data, ordered like jellyfin-web
        // (embedded first, externals last) — same as the initial list.
        const streams = [
          ...(mediaSource?.MediaStreams?.filter(
            (s: MediaStream) => s.Type === "Subtitle",
          ) ?? []),
        ].sort(compareTracksForMenu);

        // Convert to Track[] with setTrack callbacks
        const tracks: Track[] = streams.map((stream) => ({
          name:
            stream.DisplayTitle ||
            `${stream.Language || "Unknown"} (${stream.Codec})`,
          index: stream.Index ?? -1,
          setTrack: () => {
            handleSubtitleChangeRef.current?.(stream.Index ?? -1);
          },
        }));

        // Add locally downloaded subtitles
        if (item?.Id) {
          const localSubs = getSubtitlesForItem(item.Id);
          let localIdx = 0;
          for (const localSub of localSubs) {
            const subtitleFile = new File(localSub.filePath);
            if (!subtitleFile.exists) continue;

            const localIndex = LOCAL_SUBTITLE_INDEX_START - localIdx;
            tracks.push({
              name: localSub.name,
              index: localIndex,
              isLocal: true,
              localPath: localSub.filePath,
              setTrack: () => {
                handleSubtitleChangeRef.current?.(localIndex);
              },
            });
            localIdx++;
          }
        }

        return tracks;
      } catch (error) {
        console.error("Failed to refresh subtitle tracks:", error);
        return [];
      }
    }, [api, item?.Id, selectedOptions?.mediaSource?.Id]);

    // Get display values for buttons
    const selectedAudioLabel = useMemo(() => {
      const track = audioTracks.find(
        (t) => t.Index === selectedOptions?.audioIndex,
      );
      return track?.DisplayTitle || track?.Language || t("item_card.audio");
    }, [audioTracks, selectedOptions?.audioIndex, t]);

    const selectedSubtitleLabel = useMemo(() => {
      if (selectedOptions?.subtitleIndex === -1)
        return t("item_card.subtitles.none");

      // Check if it's a local subtitle (negative index starting at -100)
      if (
        selectedOptions?.subtitleIndex !== undefined &&
        selectedOptions.subtitleIndex <= LOCAL_SUBTITLE_INDEX_START
      ) {
        const localTrack = subtitleTracksForModal.find(
          (t) => t.index === selectedOptions.subtitleIndex,
        );
        return localTrack?.name || t("item_card.subtitles.label");
      }

      const track = subtitleStreams.find(
        (t) => t.Index === selectedOptions?.subtitleIndex,
      );
      return (
        track?.DisplayTitle || track?.Language || t("item_card.subtitles.label")
      );
    }, [
      subtitleStreams,
      subtitleTracksForModal,
      selectedOptions?.subtitleIndex,
      t,
    ]);

    const selectedMediaSourceLabel = useMemo(() => {
      const source = selectedOptions?.mediaSource;
      if (!source) return t("item_card.video");
      const videoStream = source.MediaStreams?.find((s) => s.Type === "Video");
      return videoStream?.DisplayTitle || source.Name || t("item_card.video");
    }, [selectedOptions?.mediaSource, t]);

    const selectedQualityLabel = useMemo(() => {
      return selectedOptions?.bitrate?.key || t("item_card.quality");
    }, [selectedOptions?.bitrate?.key, t]);

    // Format year and duration
    const year = item?.ProductionYear;
    const duration = item?.RunTimeTicks
      ? runtimeTicksToMinutes(item.RunTimeTicks)
      : null;
    const hasProgress = (item?.UserData?.PlaybackPositionTicks ?? 0) > 0;
    const remainingTime = hasProgress
      ? runtimeTicksToMinutes(
          (item?.RunTimeTicks || 0) -
            (item?.UserData?.PlaybackPositionTicks || 0),
        )
      : null;

    // Get director
    const director = item?.People?.find((p) => p.Type === "Director");

    // Get cast (first 3 for text display)
    const cast = item?.People?.filter((p) => p.Type === "Actor")?.slice(0, 3);

    // Get full cast for visual display (up to 10 actors)
    const fullCast = useMemo(() => {
      return (
        item?.People?.filter((p) => p.Type === "Actor")?.slice(0, 10) ?? []
      );
    }, [item?.People]);

    // Whether to show visual cast section
    const showVisualCast =
      (item?.Type === "Movie" ||
        item?.Type === "Series" ||
        item?.Type === "Episode") &&
      fullCast.length > 0;

    // Series/Season image URLs for episodes
    const seriesImageUrl = useMemo(() => {
      if (item?.Type !== "Episode" || !item.SeriesId) return null;
      return getPrimaryImageUrlById({ api, id: item.SeriesId, width: 300 });
    }, [api, item?.Type, item?.SeriesId]);

    const seasonImageUrl = useMemo(() => {
      if (item?.Type !== "Episode") return null;
      const seasonId = item.SeasonId || item.ParentId;
      if (!seasonId) return null;
      return getPrimaryImageUrlById({ api, id: seasonId, width: 300 });
    }, [api, item?.Type, item?.SeasonId, item?.ParentId]);

    // Episode thumbnail URL - episode's own primary image (16:9 for episodes)
    const episodeThumbnailUrl = useMemo(() => {
      if (item?.Type !== "Episode" || !api) return null;
      return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }, [api, item]);

    // Series thumb URL - used when showSeriesPosterOnEpisode setting is enabled
    const seriesThumbUrl = useMemo(() => {
      if (item?.Type !== "Episode" || !item.SeriesId || !api) return null;
      return `${api.basePath}/Items/${item.SeriesId}/Images/Thumb?fillHeight=700&quality=80`;
    }, [api, item]);

    // Navigation handlers
    const handleActorPress = useCallback(
      (personId: string) => {
        router.push(`/(auth)/persons/${personId}`);
      },
      [router],
    );

    const handleSeriesPress = useCallback(() => {
      if (item?.SeriesId) {
        router.push(`/(auth)/series/${item.SeriesId}`);
      }
    }, [router, item?.SeriesId]);

    const handleSeasonPress = useCallback(() => {
      if (item?.SeriesId && item?.ParentIndexNumber) {
        router.push(
          `/(auth)/series/${item.SeriesId}?seasonIndex=${item.ParentIndexNumber}`,
        );
      }
    }, [router, item?.SeriesId, item?.ParentIndexNumber]);

    const handleEpisodePress = useCallback(
      (episode: BaseItemDto) => {
        const navigation = getItemNavigation(episode, "(home)");
        router.replace(navigation as any);
      },
      [router],
    );

    if (!item || !selectedOptions) return null;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
        }}
      >
        {/* Full-screen backdrop */}
        <TVBackdrop item={item} />

        {/* Main content area */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 140,
            paddingBottom: insets.bottom + 60,
            paddingHorizontal: insets.left + 80,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top section - Logo/Title + Metadata */}
          <View
            style={{
              flexDirection: "row",
              minHeight: SCREEN_HEIGHT * 0.45,
            }}
          >
            {/* Left side - Content */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              {/* Logo or Title */}
              {logoUrl ? (
                <Image
                  source={{ uri: logoUrl }}
                  style={{
                    height: 150,
                    width: "80%",
                    marginBottom: 24,
                  }}
                  contentFit='contain'
                  contentPosition='left'
                />
              ) : (
                <Text
                  style={{
                    fontSize: typography.display,
                    fontWeight: "bold",
                    color: "#FFFFFF",
                    marginBottom: 20,
                  }}
                  numberOfLines={2}
                >
                  {item.Name}
                </Text>
              )}

              {/* Episode info for TV shows */}
              {item.Type === "Episode" && (
                <View style={{ marginBottom: 16 }}>
                  <Text
                    style={{
                      fontSize: typography.title,
                      color: "#FFFFFF",
                      fontWeight: "600",
                    }}
                  >
                    {item.SeriesName}
                  </Text>
                  <Text
                    style={{
                      fontSize: typography.body,
                      color: "white",
                      marginTop: 6,
                    }}
                  >
                    S{item.ParentIndexNumber} E{item.IndexNumber} · {item.Name}
                  </Text>
                </View>
              )}

              {/* Metadata badges row */}
              <TVMetadataBadges
                year={year}
                duration={duration}
                officialRating={item.OfficialRating}
                communityRating={item.CommunityRating}
              />

              {/* Genres */}
              {item.Genres && item.Genres.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <GenreTags genres={item.Genres} />
                </View>
              )}

              {/* Overview */}
              {item.Overview && (
                <BlurView
                  intensity={10}
                  tint='light'
                  style={{
                    borderRadius: 8,
                    overflow: "hidden",
                    maxWidth: SCREEN_WIDTH * 0.45,
                    marginBottom: 32,
                  }}
                >
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: "rgba(0,0,0,0.3)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typography.body,
                        color: "#E5E7EB",
                        lineHeight: 32,
                      }}
                      numberOfLines={4}
                    >
                      {item.Overview}
                    </Text>
                  </View>
                </BlurView>
              )}

              {/* Action buttons */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                <TVButton
                  onPress={handlePlay}
                  hasTVPreferredFocus
                  variant='primary'
                >
                  <Ionicons
                    name='play'
                    size={28}
                    color='#000000'
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={{
                      fontSize: typography.callout,
                      fontWeight: "bold",
                      color: "#000000",
                    }}
                  >
                    {hasProgress
                      ? `${remainingTime} ${t("item_card.left")}`
                      : t("common.play")}
                  </Text>
                </TVButton>
                <TVFavoriteButton item={item} />
                {settings.useKefinTweaks && <TVWatchlistButton item={item} />}
                <TVPlayedButton item={item} />
                <TVRefreshButton itemId={item.Id} />
              </View>

              {/* Playback options */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {/* Quality selector */}
                <TVOptionButton
                  label={t("item_card.quality")}
                  value={selectedQualityLabel}
                  maxWidth={200}
                  onPress={() =>
                    showOptions({
                      title: t("item_card.quality"),
                      options: qualityOptions,
                      onSelect: handleQualityChange,
                    })
                  }
                />

                {/* Media source selector (only if multiple sources) */}
                {mediaSources.length > 1 && (
                  <TVOptionButton
                    label={t("item_card.video")}
                    value={selectedMediaSourceLabel}
                    maxWidth={280}
                    onPress={() =>
                      showOptions({
                        title: t("item_card.video"),
                        options: mediaSourceOptions,
                        onSelect: handleMediaSourceChange,
                      })
                    }
                  />
                )}

                {/* Audio selector */}
                {audioTracks.length > 0 && (
                  <TVOptionButton
                    label={t("item_card.audio")}
                    value={selectedAudioLabel}
                    maxWidth={280}
                    onPress={() =>
                      showOptions({
                        title: t("item_card.audio"),
                        options: audioOptions,
                        onSelect: handleAudioChange,
                      })
                    }
                  />
                )}

                {/* Subtitle selector */}
                {(subtitleStreams.length > 0 ||
                  selectedOptions?.subtitleIndex !== undefined) && (
                  <TVOptionButton
                    label={t("item_card.subtitles.label")}
                    value={selectedSubtitleLabel}
                    maxWidth={280}
                    onPress={() =>
                      showSubtitleModal({
                        item,
                        mediaSourceId: selectedOptions?.mediaSource?.Id,
                        subtitleTracks: subtitleTracksForModal,
                        currentSubtitleIndex:
                          selectedOptions?.subtitleIndex ?? -1,
                        onDisableSubtitles: () => handleSubtitleChange(-1),
                        onServerSubtitleDownloaded:
                          handleServerSubtitleDownloaded,
                        onLocalSubtitleDownloaded:
                          handleLocalSubtitleDownloaded,
                        refreshSubtitleTracks,
                      })
                    }
                  />
                )}
              </View>

              {/* Progress bar (if partially watched) */}
              {hasProgress && item.RunTimeTicks != null && (
                <TVProgressBar
                  progress={
                    (item.UserData?.PlaybackPositionTicks || 0) /
                    item.RunTimeTicks
                  }
                  fillColor='#FFFFFF'
                />
              )}
            </View>

            {/* Right side - Poster */}
            <View
              style={{
                width:
                  item.Type === "Episode"
                    ? SCREEN_WIDTH * 0.35
                    : SCREEN_WIDTH * 0.22,
                marginLeft: 50,
              }}
            >
              <View
                style={{
                  aspectRatio: item.Type === "Episode" ? 16 / 9 : 2 / 3,
                  borderRadius: 16,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                }}
              >
                {item.Type === "Episode" ? (
                  <Image
                    source={{
                      uri:
                        settings.showSeriesPosterOnEpisode && seriesThumbUrl
                          ? seriesThumbUrl
                          : episodeThumbnailUrl!,
                    }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit='cover'
                  />
                ) : (
                  <ItemImage
                    variant='Primary'
                    item={item}
                    style={{
                      width: "100%",
                      height: "100%",
                    }}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Additional info section */}
          <View style={{ marginTop: 40 }}>
            {/* Season Episodes - Episode only */}
            {item.Type === "Episode" && seasonEpisodes.length > 1 && (
              <View style={{ marginBottom: 40 }}>
                <Text
                  style={{
                    fontSize: typography.heading,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 24,
                  }}
                >
                  {t("item_card.more_from_this_season")}
                </Text>

                <TVEpisodeList
                  episodes={seasonEpisodes}
                  currentEpisodeId={item.Id}
                  onEpisodePress={handleEpisodePress}
                  onEpisodeLongPress={showItemActions}
                  firstEpisodeRefSetter={setFirstEpisodeRef}
                  horizontalPadding={insets.left + 80}
                />
              </View>
            )}

            {/* From this Series - Episode only */}
            <TVSeriesNavigation
              item={item}
              seriesImageUrl={seriesImageUrl}
              seasonImageUrl={seasonImageUrl}
              onSeriesPress={handleSeriesPress}
              onSeasonPress={handleSeasonPress}
            />

            {/* Visual Cast Section - Movies/Series/Episodes with circular actor cards */}
            {showVisualCast && (
              <TVCastSection
                cast={fullCast}
                apiBasePath={api?.basePath}
                onActorPress={handleActorPress}
                firstActorRefSetter={setFirstActorCardRef}
                horizontalPadding={insets.left + 80}
              />
            )}

            {/* Cast & Crew (text version - director, etc.) */}
            <TVCastCrewText
              director={director}
              cast={cast}
              hideCast={showVisualCast}
            />

            {/* Technical details */}
            {selectedOptions.mediaSource?.MediaStreams &&
              selectedOptions.mediaSource.MediaStreams.length > 0 && (
                <TVTechnicalDetails
                  mediaStreams={selectedOptions.mediaSource.MediaStreams}
                />
              )}
          </View>
        </ScrollView>
      </View>
    );
  },
);

// Alias for platform-resolved imports (tvOS auto-resolves .tv.tsx files)
export const ItemContent = ItemContentTV;
