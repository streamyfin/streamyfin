import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useSegments } from "expo-router";
import { useAtom } from "jotai";
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
  FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { seasonIndexAtom } from "@/components/series/SeasonPicker";
import {
  TV_EPISODE_WIDTH,
  TVEpisodeCard,
} from "@/components/series/TVEpisodeCard";
import { TVSeasonSelector } from "@/components/series/TVSeasonSelector";
import { TVSeriesHeader } from "@/components/series/TVSeriesHeader";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  buildOfflineSeasons,
  getDownloadedEpisodesForSeason,
} from "@/utils/downloads/offline-series";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const HORIZONTAL_PADDING = 80;
const TOP_PADDING = 140;
const POSTER_WIDTH_PERCENT = 0.22;
const ITEM_GAP = 16;
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
}> = ({
  onPress,
  children,
  hasTVPreferredFocus,
  disabled = false,
  variant = "primary",
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
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.02);
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
          shadowOpacity: focused ? 0.4 : 0,
          shadowRadius: focused ? 12 : 0,
        }}
      >
        <View
          style={{
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
            borderRadius: 10,
            paddingVertical: 14,
            paddingHorizontal: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              color: focused ? "#000" : "#FFFFFF",
              fontWeight: "500",
            }}
          >
            {seasonName}
          </Text>
          <Ionicons
            name='chevron-down'
            size={18}
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const isOffline = useOfflineMode();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();

  // Season state
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const selectedSeasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""] ?? 1,
    [item.Id, seasonIndexState],
  );

  // Modal state
  const [openModal, setOpenModal] = useState<"season" | null>(null);
  const isModalOpen = openModal !== null;

  // ScrollView ref for page scrolling
  const mainScrollRef = useRef<ScrollView>(null);
  // FlatList ref for scrolling back
  const episodeListRef = useRef<FlatList<BaseItemDto>>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  // Scroll back to start when episode list loses focus
  useEffect(() => {
    if (prevFocusedCount.current > 0 && focusedCount === 0) {
      episodeListRef.current?.scrollToOffset({ offset: 0, animated: true });
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
    staleTime: isOffline ? Infinity : 0,
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

  // Episode list item layout
  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: TV_EPISODE_WIDTH + ITEM_GAP,
      offset: (TV_EPISODE_WIDTH + ITEM_GAP) * index,
      index,
    }),
    [],
  );

  // Render episode card
  const renderEpisode = useCallback(
    ({ item: episode }: { item: BaseItemDto; index: number }) => (
      <View style={{ marginRight: ITEM_GAP }}>
        <TVEpisodeCard
          episode={episode}
          onPress={() => handleEpisodePress(episode)}
          disabled={isModalOpen}
          onFocus={handleEpisodeFocus}
          onBlur={handleEpisodeBlur}
        />
      </View>
    ),
    [handleEpisodePress, isModalOpen, handleEpisodeFocus, handleEpisodeBlur],
  );

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
        {/* Top section - Poster + Content */}
        <View
          style={{
            flexDirection: "row",
            minHeight: SCREEN_HEIGHT * 0.45,
          }}
        >
          {/* Left side - Poster */}
          <View
            style={{
              width: SCREEN_WIDTH * POSTER_WIDTH_PERCENT,
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
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          </View>

          {/* Right side - Content */}
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
                hasTVPreferredFocus
                disabled={isModalOpen}
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
                    fontSize: 20,
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
                  onPress={() => setOpenModal("season")}
                  disabled={isModalOpen}
                />
              )}
            </View>
          </View>
        </View>

        {/* Episodes section */}
        <View style={{ marginTop: 40, overflow: "visible" }}>
          <Text
            style={{
              fontSize: 22,
              fontWeight: "600",
              color: "#FFFFFF",
              marginBottom: 16,
              marginLeft: SCALE_PADDING,
            }}
          >
            {selectedSeasonName}
          </Text>

          <FlatList
            ref={episodeListRef}
            horizontal
            data={episodesForSeason}
            keyExtractor={(ep) => ep.Id!}
            renderItem={renderEpisode}
            showsHorizontalScrollIndicator={false}
            initialNumToRender={5}
            maxToRenderPerBatch={3}
            windowSize={5}
            removeClippedSubviews={false}
            getItemLayout={getItemLayout}
            style={{ overflow: "visible" }}
            contentContainerStyle={{
              paddingVertical: SCALE_PADDING,
              paddingHorizontal: SCALE_PADDING,
            }}
            ListEmptyComponent={
              <Text
                style={{
                  color: "#737373",
                  fontSize: 16,
                  marginLeft: SCALE_PADDING,
                }}
              >
                {t("item_card.no_episodes_for_this_season")}
              </Text>
            }
          />
        </View>
      </ScrollView>

      {/* Season selector modal */}
      <TVSeasonSelector
        visible={openModal === "season"}
        seasons={seasons}
        selectedSeasonIndex={selectedSeasonIndex}
        onSelect={handleSeasonSelect}
        onClose={() => setOpenModal(null)}
      />
    </View>
  );
};
