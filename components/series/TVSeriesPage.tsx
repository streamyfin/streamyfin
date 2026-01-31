import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useSegments } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  TVFocusGuideView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { seasonIndexAtom } from "@/components/series/SeasonPicker";
import { TVEpisodeList } from "@/components/series/TVEpisodeList";
import { TVSeriesHeader } from "@/components/series/TVSeriesHeader";
import { TVFavoriteButton } from "@/components/tv/TVFavoriteButton";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVSeriesSeasonModal } from "@/hooks/useTVSeriesSeasonModal";
import { useTVThemeMusic } from "@/hooks/useTVThemeMusic";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { tvSeriesSeasonModalAtom } from "@/utils/atoms/tvSeriesSeasonModal";
import {
  buildOfflineSeasons,
  getDownloadedEpisodesForSeason,
} from "@/utils/downloads/offline-series";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const HORIZONTAL_PADDING = 80;
const TOP_PADDING = 140;
const POSTER_WIDTH_PERCENT = 0.22;
const SCALE_PADDING = 20;

interface TVSeriesPageProps {
  item: BaseItemDto;
  allEpisodes?: BaseItemDto[];
  isLoading?: boolean;
}

// Focusable button component for TV
const TVFocusableButton: React.FC<{
  onPress: () => void;
  children: React.ReactNode;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  refSetter?: (ref: View | null) => void;
}> = ({
  onPress,
  children,
  hasTVPreferredFocus,
  disabled = false,
  variant = "primary",
  refSetter,
}) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const isPrimary = variant === "primary";

  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor: isPrimary ? "#fff" : "#a855f7",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
        ]}
      >
        <View
          style={{
            backgroundColor: focused
              ? isPrimary
                ? "#ffffff"
                : "#7c3aed"
              : isPrimary
                ? "rgba(255, 255, 255, 0.9)"
                : "rgba(124, 58, 237, 0.8)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 180,
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Pressable>
  );
};

// Season selector button
const TVSeasonButton: React.FC<{
  seasonName: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ seasonName, onPress, disabled = false }) => {
  const typography = useScaledTVTypography();
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          shadowColor: "#fff",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.6 : 0,
          shadowRadius: focused ? 20 : 0,
        }}
      >
        <View
          style={{
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <Text
            style={{
              fontSize: typography.body,
              color: focused ? "#000" : "#FFFFFF",
              fontWeight: "bold",
            }}
          >
            {seasonName}
          </Text>
          <Ionicons
            name='chevron-down'
            size={28}
            color={focused ? "#000" : "#FFFFFF"}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};

export const TVSeriesPage: React.FC<TVSeriesPageProps> = ({
  item,
  allEpisodes = [],
  isLoading: _isLoading,
}) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const isOffline = useOfflineMode();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();
  const { showSeasonModal } = useTVSeriesSeasonModal();
  const { showItemActions } = useTVItemActionModal();
  const seasonModalState = useAtomValue(tvSeriesSeasonModalAtom);
  const isSeasonModalVisible = seasonModalState !== null;

  // Auto-play theme music (handles fade in/out and cleanup)
  useTVThemeMusic(item.Id);

  // Season state
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const selectedSeasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""] ?? 1,
    [item.Id, seasonIndexState],
  );

  // Focus guide refs (using useState to trigger re-renders when refs are set)
  const [playButtonRef, setPlayButtonRef] = useState<View | null>(null);
  const [firstEpisodeRef, setFirstEpisodeRef] = useState<View | null>(null);

  // ScrollView ref for page scrolling
  const mainScrollRef = useRef<ScrollView>(null);
  // ScrollView ref for scrolling back
  const episodeListRef = useRef<ScrollView>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  // Scroll back to start when episode list loses focus
  useEffect(() => {
    if (prevFocusedCount.current > 0 && focusedCount === 0) {
      episodeListRef.current?.scrollTo({ x: 0, animated: true });
      // Scroll page back to top when leaving episode section
      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    prevFocusedCount.current = focusedCount;
  }, [focusedCount]);

  const handleEpisodeFocus = useCallback(() => {
    setFocusedCount((c) => {
      // Scroll page down when first episode receives focus
      if (c === 0) {
        mainScrollRef.current?.scrollTo({ y: 200, animated: true });
      }
      return c + 1;
    });
  }, []);

  const handleEpisodeBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
  }, []);

  // Fetch seasons
  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons", item.Id, isOffline, downloadedItems.length],
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeasons(getDownloadedItems(), item.Id!);
      }
      if (!api || !user?.Id || !item.Id) return [];

      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${item.Id}/Seasons`,
        {
          params: {
            userId: user.Id,
            itemId: item.Id,
            Fields: "ItemCounts,PrimaryImageAspectRatio",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        },
      );
      return response.data.Items || [];
    },
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id && !!item.Id),
  });

  // Get selected season ID
  const selectedSeasonId = useMemo(() => {
    const season = seasons.find(
      (s: BaseItemDto) =>
        s.IndexNumber === selectedSeasonIndex ||
        s.Name === String(selectedSeasonIndex),
    );
    return season?.Id ?? null;
  }, [seasons, selectedSeasonIndex]);

  // Get selected season number for offline mode
  const selectedSeasonNumber = useMemo(() => {
    if (!isOffline) return null;
    const season = seasons.find(
      (s: BaseItemDto) =>
        s.IndexNumber === selectedSeasonIndex ||
        s.Name === String(selectedSeasonIndex),
    );
    return season?.IndexNumber ?? null;
  }, [isOffline, seasons, selectedSeasonIndex]);

  // Fetch episodes for selected season
  const { data: episodesForSeason = [] } = useQuery({
    queryKey: [
      "episodes",
      item.Id,
      isOffline ? selectedSeasonNumber : selectedSeasonId,
      isOffline,
      downloadedItems.length,
    ],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeason(
          getDownloadedItems(),
          item.Id!,
          selectedSeasonNumber!,
        );
      }
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) return [];

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: selectedSeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview", "Trickplay"],
      });
      return res.data.Items || [];
    },
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline ? 60 * 1000 : undefined,
    enabled: isOffline
      ? !!item.Id && selectedSeasonNumber !== null
      : !!api && !!user?.Id && !!item.Id && !!selectedSeasonId,
  });

  // Find next unwatched episode
  const nextUnwatchedEpisode = useMemo(() => {
    // First check all episodes for a "next up" candidate
    for (const ep of allEpisodes) {
      if (!ep.UserData?.Played) {
        // Check if it has progress (continue watching)
        if ((ep.UserData?.PlaybackPositionTicks ?? 0) > 0) {
          return ep;
        }
      }
    }

    // Find first unwatched
    return allEpisodes.find((ep) => !ep.UserData?.Played) || allEpisodes[0];
  }, [allEpisodes]);

  // Get season name for button
  const selectedSeasonName = useMemo(() => {
    const season = seasons.find(
      (s: BaseItemDto) =>
        s.IndexNumber === selectedSeasonIndex ||
        s.Name === String(selectedSeasonIndex),
    );
    return season?.Name || `Season ${selectedSeasonIndex}`;
  }, [seasons, selectedSeasonIndex]);

  // Handle episode press
  const handleEpisodePress = useCallback(
    (episode: BaseItemDto) => {
      const navigation = getItemNavigation(episode, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // Handle play next episode
  const handlePlayNextEpisode = useCallback(() => {
    if (nextUnwatchedEpisode) {
      const navigation = getItemNavigation(nextUnwatchedEpisode, from);
      router.push(navigation as any);
    }
  }, [nextUnwatchedEpisode, from, router]);

  // Handle season selection
  const handleSeasonSelect = useCallback(
    (seasonIdx: number) => {
      if (!item.Id) return;
      setSeasonIndexState((prev) => ({
        ...prev,
        [item.Id!]: seasonIdx,
      }));
    },
    [item.Id, setSeasonIndexState],
  );

  // Season options for the modal
  const seasonOptions = useMemo(() => {
    return seasons.map((season: BaseItemDto) => ({
      label: season.Name || `Season ${season.IndexNumber}`,
      value: season.IndexNumber ?? 0,
      selected:
        season.IndexNumber === selectedSeasonIndex ||
        season.Name === String(selectedSeasonIndex),
    }));
  }, [seasons, selectedSeasonIndex]);

  // Open season modal
  const handleOpenSeasonModal = useCallback(() => {
    if (!item.Id) return;
    showSeasonModal({
      seasons: seasonOptions,
      selectedSeasonIndex,
      itemId: item.Id,
      onSeasonSelect: handleSeasonSelect,
    });
  }, [
    item.Id,
    seasonOptions,
    selectedSeasonIndex,
    handleSeasonSelect,
    showSeasonModal,
  ]);

  // Get play button text
  const playButtonText = useMemo(() => {
    if (!nextUnwatchedEpisode) return t("common.play");

    const season = nextUnwatchedEpisode.ParentIndexNumber;
    const episode = nextUnwatchedEpisode.IndexNumber;
    const hasProgress =
      (nextUnwatchedEpisode.UserData?.PlaybackPositionTicks ?? 0) > 0;

    if (hasProgress) {
      return `${t("home.continue")} S${season}:E${episode}`;
    }
    return `${t("common.play")} S${season}:E${episode}`;
  }, [nextUnwatchedEpisode, t]);

  if (!item) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Full-screen backdrop */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <ItemImage
          variant='Backdrop'
          item={item}
          style={{ width: "100%", height: "100%" }}
        />
        {/* Gradient overlays for readability */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.5, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "70%",
          }}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.8)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "60%",
          }}
        />
      </View>

      {/* Main content */}
      <ScrollView
        ref={mainScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + TOP_PADDING,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
          paddingBottom: insets.bottom + 60,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top section - Content + Poster */}
        <View
          style={{
            flexDirection: "row",
            minHeight: SCREEN_HEIGHT * 0.45,
          }}
        >
          {/* Left side - Content */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <TVSeriesHeader item={item} />

            {/* Action buttons */}
            <View
              style={{
                flexDirection: "row",
                gap: 16,
                marginTop: 32,
              }}
            >
              <TVFocusableButton
                onPress={handlePlayNextEpisode}
                hasTVPreferredFocus={!isSeasonModalVisible}
                disabled={isSeasonModalVisible}
                variant='primary'
                refSetter={setPlayButtonRef}
              >
                <Ionicons
                  name='play'
                  size={28}
                  color='#000000'
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={{
                    fontSize: typography.body,
                    fontWeight: "bold",
                    color: "#000000",
                  }}
                >
                  {playButtonText}
                </Text>
              </TVFocusableButton>

              {seasons.length > 1 && (
                <TVSeasonButton
                  seasonName={selectedSeasonName}
                  onPress={handleOpenSeasonModal}
                  disabled={isSeasonModalVisible}
                />
              )}

              <TVFavoriteButton item={item} disabled={isSeasonModalVisible} />
            </View>
          </View>

          {/* Right side - Poster */}
          <View
            style={{
              width: SCREEN_WIDTH * POSTER_WIDTH_PERCENT,
              marginLeft: 50,
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
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          </View>
        </View>

        {/* Episodes section */}
        <View style={{ marginTop: 40, overflow: "visible" }}>
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "600",
              color: "#FFFFFF",
              marginBottom: 24,
              marginLeft: SCALE_PADDING,
            }}
          >
            {selectedSeasonName}
          </Text>

          {/* Bidirectional focus guides - stacked together above the list */}
          {/* Downward: Play button → first episode */}
          {firstEpisodeRef && (
            <TVFocusGuideView
              destinations={[firstEpisodeRef]}
              style={{ height: 1, width: "100%" }}
            />
          )}
          {/* Upward: episodes → Play button */}
          {playButtonRef && (
            <TVFocusGuideView
              destinations={[playButtonRef]}
              style={{ height: 1, width: "100%" }}
            />
          )}

          <TVEpisodeList
            episodes={episodesForSeason}
            disabled={isSeasonModalVisible}
            onEpisodePress={handleEpisodePress}
            onEpisodeLongPress={showItemActions}
            onFocus={handleEpisodeFocus}
            onBlur={handleEpisodeBlur}
            scrollViewRef={episodeListRef}
            firstEpisodeRefSetter={setFirstEpisodeRef}
            emptyText={t("item_card.no_episodes_for_this_season")}
            horizontalPadding={HORIZONTAL_PADDING}
          />
        </View>
      </ScrollView>
    </View>
  );
};
