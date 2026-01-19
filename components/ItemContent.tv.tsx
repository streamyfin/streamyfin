import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, ScrollView, TVFocusGuideView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import {
  TVBackdrop,
  TVButton,
  TVCastCrewText,
  TVCastSection,
  TVMetadataBadges,
  TVOptionButton,
  TVProgressBar,
  TVRefreshButton,
  TVSeriesNavigation,
  TVTechnicalDetails,
} from "@/components/tv";
import { TVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { runtimeTicksToMinutes } from "@/utils/time";

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
    const [api] = useAtom(apiAtom);
    const [_user] = useAtom(userAtom);
    const isOffline = useOfflineMode();
    const { settings } = useSettings();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const _itemColors = useImageColorsReturn({ item });

    const [selectedOptions, setSelectedOptions] = useState<
      SelectedOptions | undefined
    >(undefined);

    const {
      defaultAudioIndex,
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
    } = useDefaultPlaySettings(itemWithSources ?? item, settings);

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

    const handlePlay = () => {
      if (!item || !selectedOptions) return;

      const queryParams = new URLSearchParams({
        itemId: item.Id!,
        audioIndex: selectedOptions.audioIndex?.toString() ?? "",
        subtitleIndex: selectedOptions.subtitleIndex?.toString() ?? "",
        mediaSourceId: selectedOptions.mediaSource?.Id ?? "",
        bitrateValue: selectedOptions.bitrate?.value?.toString() ?? "",
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "0",
        offline: isOffline ? "true" : "false",
      });

      router.push(`/player/direct-player?${queryParams.toString()}`);
    };

    // TV Option Modal hook for quality, audio, media source selectors
    const { showOptions } = useTVOptionModal();

    // TV Subtitle Modal hook
    const { showSubtitleModal } = useTVSubtitleModal();

    // State for first actor card ref (used for focus guide)
    const [firstActorCardRef, setFirstActorCardRef] = useState<View | null>(
      null,
    );

    // State for last option button ref (used for upward focus guide from cast)
    const [lastOptionButtonRef, setLastOptionButtonRef] = useState<View | null>(
      null,
    );

    // Get available audio tracks
    const audioTracks = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Audio",
      );
      return streams ?? [];
    }, [selectedOptions?.mediaSource]);

    // Get available subtitle tracks
    const subtitleTracks = useMemo(() => {
      const streams = selectedOptions?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      return streams ?? [];
    }, [selectedOptions?.mediaSource]);

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

    // Refresh subtitle tracks by fetching fresh item data from Jellyfin
    const refreshSubtitleTracks = useCallback(async (): Promise<
      MediaStream[]
    > => {
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

        // Return subtitle tracks from the fresh data
        return (
          mediaSource?.MediaStreams?.filter(
            (s: MediaStream) => s.Type === "Subtitle",
          ) ?? []
        );
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
      const track = subtitleTracks.find(
        (t) => t.Index === selectedOptions?.subtitleIndex,
      );
      return (
        track?.DisplayTitle || track?.Language || t("item_card.subtitles.label")
      );
    }, [subtitleTracks, selectedOptions?.subtitleIndex, t]);

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

    // Determine which option button is the last one (for focus guide targeting)
    const lastOptionButton = useMemo(() => {
      const hasSubtitleOption =
        subtitleTracks.length > 0 ||
        selectedOptions?.subtitleIndex !== undefined;
      const hasAudioOption = audioTracks.length > 0;
      const hasMediaSourceOption = mediaSources.length > 1;

      if (hasSubtitleOption) return "subtitle";
      if (hasAudioOption) return "audio";
      if (hasMediaSourceOption) return "mediaSource";
      return "quality";
    }, [
      subtitleTracks.length,
      selectedOptions?.subtitleIndex,
      audioTracks.length,
      mediaSources.length,
    ]);

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
            {/* Left side - Poster */}
            <View
              style={{
                width: SCREEN_WIDTH * 0.22,
                marginRight: 50,
              }}
            >
              <View
                style={{
                  aspectRatio: 2 / 3,
                  borderRadius: 16,
                  overflow: "hidden",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.5,
                  shadowRadius: 20,
                }}
              >
                <ItemImage
                  variant='Primary'
                  item={item}
                  style={{
                    width: "100%",
                    height: "100%",
                  }}
                />
              </View>
            </View>

            {/* Right side - Content */}
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
                    fontSize: TVTypography.display,
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
                      fontSize: TVTypography.title,
                      color: "#FFFFFF",
                      fontWeight: "600",
                    }}
                  >
                    {item.SeriesName}
                  </Text>
                  <Text
                    style={{
                      fontSize: TVTypography.body,
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
                        fontSize: TVTypography.body,
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
                      fontSize: TVTypography.callout,
                      fontWeight: "bold",
                      color: "#000000",
                    }}
                  >
                    {hasProgress
                      ? `${remainingTime} ${t("item_card.left")}`
                      : t("common.play")}
                  </Text>
                </TVButton>
                <TVRefreshButton itemId={item.Id} />
              </View>

              {/* Playback options */}
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                {/* Quality selector */}
                <TVOptionButton
                  ref={
                    lastOptionButton === "quality"
                      ? setLastOptionButtonRef
                      : undefined
                  }
                  label={t("item_card.quality")}
                  value={selectedQualityLabel}
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
                    ref={
                      lastOptionButton === "mediaSource"
                        ? setLastOptionButtonRef
                        : undefined
                    }
                    label={t("item_card.video")}
                    value={selectedMediaSourceLabel}
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
                    ref={
                      lastOptionButton === "audio"
                        ? setLastOptionButtonRef
                        : undefined
                    }
                    label={t("item_card.audio")}
                    value={selectedAudioLabel}
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
                {(subtitleTracks.length > 0 ||
                  selectedOptions?.subtitleIndex !== undefined) && (
                  <TVOptionButton
                    ref={
                      lastOptionButton === "subtitle"
                        ? setLastOptionButtonRef
                        : undefined
                    }
                    label={t("item_card.subtitles.label")}
                    value={selectedSubtitleLabel}
                    onPress={() =>
                      showSubtitleModal({
                        item,
                        mediaSourceId: selectedOptions?.mediaSource?.Id,
                        subtitleTracks,
                        currentSubtitleIndex:
                          selectedOptions?.subtitleIndex ?? -1,
                        onSubtitleIndexChange: handleSubtitleChange,
                        onServerSubtitleDownloaded:
                          handleServerSubtitleDownloaded,
                        refreshSubtitleTracks,
                      })
                    }
                  />
                )}
              </View>

              {/* Focus guide to direct navigation from options to cast list */}
              {fullCast.length > 0 && firstActorCardRef && (
                <TVFocusGuideView
                  destinations={[firstActorCardRef]}
                  style={{ height: 1, width: "100%" }}
                />
              )}

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
          </View>

          {/* Additional info section */}
          <View style={{ marginTop: 40 }}>
            {/* Cast & Crew (text version) */}
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

            {/* Visual Cast Section - Movies/Series/Episodes with circular actor cards */}
            {showVisualCast && (
              <TVCastSection
                cast={fullCast}
                apiBasePath={api?.basePath}
                onActorPress={handleActorPress}
                firstActorRefSetter={setFirstActorCardRef}
                upwardFocusDestination={lastOptionButtonRef}
              />
            )}

            {/* From this Series - Episode only */}
            <TVSeriesNavigation
              item={item}
              seriesImageUrl={seriesImageUrl}
              seasonImageUrl={seasonImageUrl}
              onSeriesPress={handleSeriesPress}
              onSeasonPress={handleSeasonPress}
            />
          </View>
        </ScrollView>
      </View>
    );
  },
);

// Alias for platform-resolved imports (tvOS auto-resolves .tv.tsx files)
export const ItemContent = ItemContentTV;
