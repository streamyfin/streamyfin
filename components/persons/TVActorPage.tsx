import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
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
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Loader } from "@/components/Loader";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const HORIZONTAL_PADDING = 80;
const TOP_PADDING = 140;
const ACTOR_IMAGE_SIZE = 250;
const SCALE_PADDING = 20;

interface TVActorPageProps {
  personId: string;
}

export const TVActorPage: React.FC<TVActorPageProps> = ({ personId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const posterSizes = useScaledTVPosterSizes();
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  // Track which filmography item is currently focused for dynamic backdrop
  const [focusedItem, setFocusedItem] = useState<BaseItemDto | null>(null);

  // Fetch actor details
  const { data: item, isLoading: isLoadingActor } = useQuery({
    queryKey: ["item", personId],
    queryFn: async () =>
      await getUserItemData({
        api,
        userId: user?.Id,
        itemId: personId,
      }),
    enabled: !!personId && !!api,
    staleTime: 60,
  });

  // Fetch movies
  const { data: movies = [], isLoading: isLoadingMovies } = useQuery({
    queryKey: ["actor", "movies", personId],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        personIds: [personId],
        startIndex: 0,
        limit: 20,
        sortOrder: ["Descending", "Descending", "Ascending"],
        includeItemTypes: ["Movie"],
        recursive: true,
        fields: ["ParentId", "PrimaryImageAspectRatio"],
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
        collapseBoxSetItems: false,
      });

      return response.data.Items || [];
    },
    enabled: !!personId && !!api && !!user?.Id,
    staleTime: 60,
  });

  // Fetch series
  const { data: series = [], isLoading: isLoadingSeries } = useQuery({
    queryKey: ["actor", "series", personId],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        personIds: [personId],
        startIndex: 0,
        limit: 20,
        sortOrder: ["Descending", "Descending", "Ascending"],
        includeItemTypes: ["Series"],
        recursive: true,
        fields: ["ParentId", "PrimaryImageAspectRatio"],
        sortBy: ["PremiereDate", "ProductionYear", "SortName"],
        collapseBoxSetItems: false,
      });

      return response.data.Items || [];
    },
    enabled: !!personId && !!api && !!user?.Id,
    staleTime: 60,
  });

  // Get backdrop URL from the currently focused filmography item
  // Changes dynamically as user navigates through the list
  const backdropUrl = useMemo(() => {
    // Use focused item if available, otherwise fall back to first movie or series
    const itemForBackdrop = focusedItem ?? movies[0] ?? series[0];
    if (!itemForBackdrop) return null;
    return getBackdropUrl({
      api,
      item: itemForBackdrop,
      quality: 90,
      width: 1920,
    });
  }, [api, focusedItem, movies, series]);

  // Crossfade animation for backdrop transitions
  // Use two alternating layers for smooth crossfade
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [layer0Url, setLayer0Url] = useState<string | null>(null);
  const [layer1Url, setLayer1Url] = useState<string | null>(null);
  const layer0Opacity = useRef(new Animated.Value(1)).current;
  const layer1Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!backdropUrl) return;

    let isCancelled = false;

    const performCrossfade = async () => {
      // Prefetch the image before starting the crossfade
      try {
        await Image.prefetch(backdropUrl);
      } catch {
        // Continue even if prefetch fails
      }

      if (isCancelled) return;

      // Determine which layer to fade in
      const incomingLayer = activeLayer === 0 ? 1 : 0;
      const incomingOpacity =
        incomingLayer === 0 ? layer0Opacity : layer1Opacity;
      const outgoingOpacity =
        incomingLayer === 0 ? layer1Opacity : layer0Opacity;

      // Set the new URL on the incoming layer
      if (incomingLayer === 0) {
        setLayer0Url(backdropUrl);
      } else {
        setLayer1Url(backdropUrl);
      }

      // Small delay to ensure image component has the new URL
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (isCancelled) return;

      // Crossfade: fade in the incoming layer, fade out the outgoing
      Animated.parallel([
        Animated.timing(incomingOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(outgoingOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isCancelled) {
          // After animation completes, switch the active layer
          setActiveLayer(incomingLayer);
        }
      });
    };

    performCrossfade();

    return () => {
      isCancelled = true;
    };
  }, [backdropUrl]);

  // Get actor image URL
  const actorImageUrl = useMemo(() => {
    if (!item?.Id || !api?.basePath) return null;
    return `${api.basePath}/Items/${item.Id}/Images/Primary?fillWidth=${ACTOR_IMAGE_SIZE * 2}&fillHeight=${ACTOR_IMAGE_SIZE * 2}&quality=90`;
  }, [api?.basePath, item?.Id]);

  // Handle filmography item press
  const handleItemPress = useCallback(
    (filmItem: BaseItemDto) => {
      const navigation = getItemNavigation(filmItem, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // List item layout
  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: posterSizes.poster + ITEM_GAP,
      offset: (posterSizes.poster + ITEM_GAP) * index,
      index,
    }),
    [],
  );

  // Render movie filmography item
  const renderMovieItem = useCallback(
    ({ item: filmItem, index }: { item: BaseItemDto; index: number }) => (
      <View style={{ marginRight: ITEM_GAP }}>
        <TVPosterCard
          item={filmItem}
          orientation='vertical'
          onPress={() => handleItemPress(filmItem)}
          onLongPress={() => showItemActions(filmItem)}
          onFocus={() => setFocusedItem(filmItem)}
          hasTVPreferredFocus={index === 0}
          width={posterSizes.poster}
        />
      </View>
    ),
    [handleItemPress, showItemActions, posterSizes.poster],
  );

  // Render series filmography item
  const renderSeriesItem = useCallback(
    ({ item: filmItem, index }: { item: BaseItemDto; index: number }) => (
      <View style={{ marginRight: ITEM_GAP }}>
        <TVPosterCard
          item={filmItem}
          orientation='vertical'
          onPress={() => handleItemPress(filmItem)}
          onLongPress={() => showItemActions(filmItem)}
          onFocus={() => setFocusedItem(filmItem)}
          hasTVPreferredFocus={movies.length === 0 && index === 0}
          width={posterSizes.poster}
        />
      </View>
    ),
    [handleItemPress, showItemActions, posterSizes.poster, movies.length],
  );

  if (isLoadingActor) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Loader />
      </View>
    );
  }

  if (!item?.Id) return null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {/* Full-screen backdrop with crossfade - two alternating layers */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        {/* Layer 0 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer0Opacity,
          }}
        >
          {layer0Url ? (
            <Image
              source={{ uri: layer0Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
          )}
        </Animated.View>
        {/* Layer 1 */}
        <Animated.View
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            opacity: layer1Opacity,
          }}
        >
          {layer1Url ? (
            <Image
              source={{ uri: layer1Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: "#1a1a1a" }} />
          )}
        </Animated.View>
        {/* Gradient overlay for readability */}
        <LinearGradient
          colors={["rgba(0,0,0,0.3)", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.95)"]}
          locations={[0, 0.4, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "100%",
          }}
        />
      </View>

      {/* Main content area */}
      <ScrollView
        style={{
          flex: 1,
        }}
        contentContainerStyle={{
          paddingTop: insets.top + TOP_PADDING,
          paddingHorizontal: insets.left + HORIZONTAL_PADDING,
          paddingBottom: 60,
        }}
      >
        {/* Top section - Actor image + Info */}
        <View
          style={{
            flexDirection: "row",
            marginBottom: 48,
          }}
        >
          {/* Left side - Circular actor image */}
          <View
            style={{
              width: ACTOR_IMAGE_SIZE,
              height: ACTOR_IMAGE_SIZE,
              borderRadius: ACTOR_IMAGE_SIZE / 2,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.1)",
              marginRight: 50,
              borderWidth: 3,
              borderColor: "rgba(255,255,255,0.2)",
            }}
          >
            {actorImageUrl ? (
              <Image
                source={{ uri: actorImageUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit='cover'
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons
                  name='person'
                  size={80}
                  color='rgba(255,255,255,0.4)'
                />
              </View>
            )}
          </View>

          {/* Right side - Info */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            {/* Actor name */}
            <Text
              style={{
                fontSize: typography.title,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 8,
              }}
              numberOfLines={2}
            >
              {item.Name}
            </Text>

            {/* Production year / Birth year */}
            {item.ProductionYear && (
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#9CA3AF",
                  marginBottom: 16,
                }}
              >
                {item.ProductionYear}
              </Text>
            )}

            {/* Biography */}
            {item.Overview && (
              <Text
                style={{
                  fontSize: typography.body,
                  color: "#D1D5DB",
                  lineHeight: typography.body * 1.4,
                  maxWidth: SCREEN_WIDTH * 0.45,
                }}
                numberOfLines={4}
              >
                {item.Overview}
              </Text>
            )}
          </View>
        </View>

        {/* Filmography sections */}
        <View style={{ flex: 1, overflow: "visible" }}>
          {/* Movies Section */}
          {isLoadingMovies ? (
            <View
              style={{
                height: 300,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Loader />
            </View>
          ) : (
            movies.length > 0 && (
              <View style={{ marginBottom: 32 }}>
                <Text
                  style={{
                    fontSize: typography.heading,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 16,
                    marginLeft: SCALE_PADDING,
                  }}
                >
                  {t("item_card.movies")}
                </Text>
                <FlatList
                  horizontal
                  data={movies}
                  keyExtractor={(filmItem) => filmItem.Id!}
                  renderItem={renderMovieItem}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={false}
                  getItemLayout={getItemLayout}
                  style={{ overflow: "visible" }}
                  contentContainerStyle={{
                    paddingVertical: SCALE_PADDING,
                    paddingHorizontal: SCALE_PADDING,
                  }}
                />
              </View>
            )
          )}

          {/* Series Section */}
          {isLoadingSeries ? (
            <View
              style={{
                height: 300,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Loader />
            </View>
          ) : (
            series.length > 0 && (
              <View>
                <Text
                  style={{
                    fontSize: typography.heading,
                    fontWeight: "600",
                    color: "#FFFFFF",
                    marginBottom: 16,
                    marginLeft: SCALE_PADDING,
                  }}
                >
                  {t("item_card.shows")}
                </Text>
                <FlatList
                  horizontal
                  data={series}
                  keyExtractor={(filmItem) => filmItem.Id!}
                  renderItem={renderSeriesItem}
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={6}
                  maxToRenderPerBatch={4}
                  windowSize={5}
                  removeClippedSubviews={false}
                  getItemLayout={getItemLayout}
                  style={{ overflow: "visible" }}
                  contentContainerStyle={{
                    paddingVertical: SCALE_PADDING,
                    paddingHorizontal: SCALE_PADDING,
                  }}
                />
              </View>
            )
          )}

          {/* Empty state - only show if both sections are empty and not loading */}
          {!isLoadingMovies &&
            !isLoadingSeries &&
            movies.length === 0 &&
            series.length === 0 && (
              <Text
                style={{
                  color: "#737373",
                  fontSize: typography.callout,
                  marginLeft: SCALE_PADDING,
                }}
              >
                {t("common.no_results")}
              </Text>
            )}
        </View>
      </ScrollView>
    </View>
  );
};
