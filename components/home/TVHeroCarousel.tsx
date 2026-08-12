import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { type ScaledTVSizes, useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { scaleSize } from "@/utils/scaleSize";
import { runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface TVHeroCarouselProps {
  items: BaseItemDto[];
  onItemFocus?: (item: BaseItemDto) => void;
  onItemLongPress?: (item: BaseItemDto) => void;
}

interface HeroCardProps {
  item: BaseItemDto;
  isFirst: boolean;
  sizes: ScaledTVSizes;
  onFocus: (item: BaseItemDto) => void;
  onPress: (item: BaseItemDto) => void;
  onLongPress?: (item: BaseItemDto) => void;
}

const HeroCard: React.FC<HeroCardProps> = React.memo(
  ({ item, isFirst, sizes, onFocus, onPress, onLongPress }) => {
    const api = useAtomValue(apiAtom);
    const [focused, setFocused] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;

    // Check if glass effect is available (tvOS 26+)
    const useGlass = Platform.OS === "ios" && isGlassEffectAvailable();

    const posterUrl = useMemo(() => {
      if (!api) return null;

      // For episodes, always use series thumb.
      // Matched pair: ParentThumbItemId owns the Thumb tag, not ParentBackdropItemId.
      if (item.Type === "Episode") {
        if (item.ParentThumbItemId && item.ParentThumbImageTag) {
          return `${api.basePath}/Items/${item.ParentThumbItemId}/Images/Thumb?fillHeight=400&quality=80&tag=${item.ParentThumbImageTag}`;
        }
        // Series without a Thumb: fall back to its backdrop, like other Jellyfin
        // clients do. The tagless Thumb request below 404s in that case.
        const parentBackdropTag = item.ParentBackdropImageTags?.[0];
        if (item.ParentBackdropItemId && parentBackdropTag) {
          return `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Backdrop?fillHeight=400&quality=80&tag=${parentBackdropTag}`;
        }
        // Reaching here means the series has no Thumb, since Jellyfin would have
        // set ParentThumbImageTag above otherwise, so the tagless series request
        // below can only 404. Try the episode's own image first, like the poster
        // cards do, rather than leaving the hero blank.
        if (item.ImageTags?.Primary) {
          return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=400&quality=80&tag=${item.ImageTags.Primary}`;
        }
        if (item.SeriesId) {
          return `${api.basePath}/Items/${item.SeriesId}/Images/Thumb?fillHeight=400&quality=80`;
        }
      }

      // For non-episodes, use item's own thumb/primary
      if (item.ImageTags?.Thumb) {
        return `${api.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=400&quality=80&tag=${item.ImageTags.Thumb}`;
      }
      if (item.ImageTags?.Primary) {
        return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=400&quality=80&tag=${item.ImageTags.Primary}`;
      }
      return null;
    }, [api, item]);

    const animateTo = useCallback(
      (value: number) =>
        Animated.timing(scale, {
          toValue: value,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(),
      [scale],
    );

    const handleFocus = useCallback(() => {
      setFocused(true);
      animateTo(sizes.animation.focusScale);
      onFocus(item);
    }, [animateTo, onFocus, item, sizes.animation.focusScale]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      animateTo(1);
    }, [animateTo]);

    const handlePress = useCallback(() => {
      onPress(item);
    }, [onPress, item]);

    const handleLongPress = useCallback(() => {
      onLongPress?.(item);
    }, [onLongPress, item]);

    // Use glass poster for tvOS 26+
    if (useGlass && posterUrl) {
      const progress = item.UserData?.PlayedPercentage || 0;
      return (
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          hasTVPreferredFocus={isFirst}
          style={{ marginRight: sizes.gaps.item }}
        >
          <GlassPosterView
            imageUrl={posterUrl}
            aspectRatio={16 / 9}
            cornerRadius={scaleSize(24)}
            progress={progress}
            showWatchedIndicator={false}
            isFocused={focused}
            width={sizes.posters.episode}
            style={{ width: sizes.posters.episode }}
          />
        </Pressable>
      );
    }

    // Fallback for non-tvOS or older tvOS
    return (
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={isFirst}
        style={{ marginRight: sizes.gaps.item }}
      >
        <Animated.View
          style={{
            width: sizes.posters.episode,
            aspectRatio: 16 / 9,
            borderRadius: scaleSize(24),
            overflow: "hidden",
            transform: [{ scale }],
            borderWidth: scaleSize(2),
            borderColor: focused ? "#FFFFFF" : "transparent",
            shadowColor: "#FFFFFF",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? scaleSize(20) : 0,
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
                backgroundColor: "rgba(255,255,255,0.1)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name='film-outline'
                size={scaleSize(48)}
                color='rgba(255,255,255,0.3)'
              />
            </View>
          )}
          <ProgressBar item={item} />
        </Animated.View>
      </Pressable>
    );
  },
);

// Debounce delay to prevent rapid backdrop changes when navigating fast
const BACKDROP_DEBOUNCE_MS = 300;

export const TVHeroCarousel: React.FC<TVHeroCarouselProps> = ({
  items,
  onItemFocus,
  onItemLongPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const api = useAtomValue(apiAtom);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Active item for featured display (debounced)
  const [activeItem, setActiveItem] = useState<BaseItemDto | null>(
    items[0] || null,
  );
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Crossfade animation state
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [layer0Url, setLayer0Url] = useState<string | null>(null);
  const [layer1Url, setLayer1Url] = useState<string | null>(null);
  const layer0Opacity = useRef(new Animated.Value(0)).current;
  const layer1Opacity = useRef(new Animated.Value(0)).current;

  // Get backdrop URL for active item
  const backdropUrl = useMemo(() => {
    if (!activeItem) return null;
    return getBackdropUrl({
      api,
      item: activeItem,
      quality: 90,
      width: 1920,
    });
  }, [api, activeItem]);

  // Get logo URL for active item
  const logoUrl = useMemo(() => {
    if (!activeItem) return null;
    return getLogoImageUrlById({ api, item: activeItem });
  }, [api, activeItem]);

  // Crossfade effect for backdrop
  useEffect(() => {
    if (!backdropUrl) return;

    let isCancelled = false;

    const performCrossfade = async () => {
      // Disk-only prefetch: backdrops are ~8MB decoded ARGB; keeping them
      // out of the memory cache avoids bloat when the user cycles through
      // hero items quickly.
      try {
        await Image.prefetch(backdropUrl, "disk");
      } catch {
        // Continue even if prefetch fails
      }

      if (isCancelled) return;

      const incomingLayer = activeLayer === 0 ? 1 : 0;
      const incomingOpacity =
        incomingLayer === 0 ? layer0Opacity : layer1Opacity;
      const outgoingOpacity =
        incomingLayer === 0 ? layer1Opacity : layer0Opacity;

      if (incomingLayer === 0) {
        setLayer0Url(backdropUrl);
      } else {
        setLayer1Url(backdropUrl);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      if (isCancelled) return;

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
          setActiveLayer(incomingLayer);
        }
      });
    };

    performCrossfade();

    return () => {
      isCancelled = true;
    };
  }, [backdropUrl]);

  // Handle card focus with debounce
  const handleCardFocus = useCallback(
    (item: BaseItemDto) => {
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Set new timer to update active item after debounce delay
      debounceTimerRef.current = setTimeout(() => {
        setActiveItem(item);
        onItemFocus?.(item);
      }, BACKDROP_DEBOUNCE_MS);
    },
    [onItemFocus],
  );

  // Handle card press - navigate to item
  const handleCardPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, "(home)");
      router.push(navigation as any);
    },
    [router],
  );

  // Get metadata for active item
  const year = activeItem?.ProductionYear;
  const duration = activeItem?.RunTimeTicks
    ? runtimeTicksToMinutes(activeItem.RunTimeTicks)
    : null;
  const hasProgress = (activeItem?.UserData?.PlaybackPositionTicks ?? 0) > 0;
  const playedPercent = activeItem?.UserData?.PlayedPercentage ?? 0;

  // Get display title
  const displayTitle = useMemo(() => {
    if (!activeItem) return "";
    if (activeItem.Type === "Episode") {
      return activeItem.SeriesName || activeItem.Name || "";
    }
    return activeItem.Name || "";
  }, [activeItem]);

  // Get subtitle for episodes
  const episodeSubtitle = useMemo(() => {
    if (activeItem?.Type !== "Episode") return null;
    return `S${activeItem.ParentIndexNumber} E${activeItem.IndexNumber} · ${activeItem.Name}`;
  }, [activeItem]);

  // Memoize hero items to prevent re-renders
  const heroItems = useMemo(() => items.slice(0, 8), [items]);

  // Memoize renderItem for FlatList
  const renderHeroCard = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <HeroCard
        item={item}
        isFirst={index === 0}
        sizes={sizes}
        onFocus={handleCardFocus}
        onPress={handleCardPress}
        onLongPress={onItemLongPress}
      />
    ),
    [handleCardFocus, handleCardPress, onItemLongPress, sizes],
  );

  // Memoize keyExtractor
  const keyExtractor = useCallback((item: BaseItemDto) => item.Id!, []);

  if (items.length === 0) return null;

  // Extra top padding for tvOS to clear the menu bar
  const tvosTopPadding = scaleSize(145);
  const heroHeight = SCREEN_HEIGHT * sizes.padding.heroHeight;

  return (
    <View
      style={{
        height: heroHeight + insets.top + tvosTopPadding,
        width: "100%",
        paddingTop: insets.top + tvosTopPadding,
      }}
    >
      {/* Backdrop layers with crossfade */}
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
          {layer0Url && (
            <Image
              source={{ uri: layer0Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
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
          {layer1Url && (
            <Image
              source={{ uri: layer1Url }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          )}
        </Animated.View>

        {/* Gradient overlays */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.95)"]}
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
          colors={["rgba(0,0,0,0.4)", "transparent"]}
          locations={[0, 1]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "40%",
          }}
        />
        {/* Horizontal gradient for left side text contrast */}
        <LinearGradient
          colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0.6)", "transparent"]}
          locations={[0, 0.5, 0.85]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "70%",
          }}
        />
      </View>

      {/* Content overlay - text elements with padding */}
      <View
        style={{
          position: "absolute",
          left: sizes.padding.horizontal,
          right: sizes.padding.horizontal,
          bottom:
            scaleSize(40) +
            sizes.posters.episode * (9 / 16) +
            sizes.gaps.small * 2 +
            scaleSize(20),
        }}
      >
        {/* Logo or Title */}
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{
              height: scaleSize(100),
              width: SCREEN_WIDTH * 0.35,
              marginBottom: scaleSize(16),
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
              marginBottom: scaleSize(12),
            }}
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
        )}

        {/* Episode subtitle */}
        {episodeSubtitle && (
          <Text
            style={{
              fontSize: typography.body,
              color: "rgba(255,255,255,0.9)",
              marginBottom: scaleSize(12),
            }}
            numberOfLines={1}
          >
            {episodeSubtitle}
          </Text>
        )}

        {/* Description */}
        {activeItem?.Overview && (
          <Text
            style={{
              fontSize: typography.body,
              color: "rgba(255,255,255,0.8)",
              marginBottom: scaleSize(16),
              maxWidth: SCREEN_WIDTH * 0.5,
              lineHeight: typography.body * 1.4,
            }}
            numberOfLines={2}
          >
            {activeItem.Overview}
          </Text>
        )}

        {/* Metadata badges */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scaleSize(16),
          }}
        >
          {year && (
            <Text
              style={{
                fontSize: typography.callout,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {year}
            </Text>
          )}
          {duration && (
            <Text
              style={{
                fontSize: typography.callout,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {duration}
            </Text>
          )}
          {activeItem?.OfficialRating && (
            <View
              style={{
                paddingHorizontal: scaleSize(8),
                paddingVertical: scaleSize(2),
                borderRadius: scaleSize(4),
                borderWidth: scaleSize(1),
                borderColor: "rgba(255,255,255,0.5)",
              }}
            >
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {activeItem.OfficialRating}
              </Text>
            </View>
          )}
          {hasProgress && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: scaleSize(6),
              }}
            >
              <View
                style={{
                  width: scaleSize(60),
                  height: scaleSize(4),
                  backgroundColor: "rgba(255,255,255,0.3)",
                  borderRadius: scaleSize(2),
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${playedPercent}%`,
                    height: "100%",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 2,
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {Math.round(playedPercent)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Thumbnail carousel - edge-to-edge */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: scaleSize(40),
        }}
      >
        <FlatList
          horizontal
          data={heroItems}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingVertical: sizes.gaps.small,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
          }}
          // Below is a work around with the contentInset, same in infiniteScrollingCollectionList, if okay on apple remove
          // ListHeaderComponent={
          //   <View style={{ width: sizes.padding.horizontal }} />
          // }
          // contentInset={{
          //   left: sizes.padding.horizontal,
          //   right: sizes.padding.horizontal,
          // }}
          // contentOffset={{ x: -sizes.padding.horizontal, y: 0 }}
          // contentContainerStyle={{ paddingVertical: sizes.gaps.small }}
          renderItem={renderHeroCard}
          removeClippedSubviews={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={3}
        />
      </View>
    </View>
  );
};
