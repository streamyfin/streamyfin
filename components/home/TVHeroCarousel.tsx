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
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { TVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HERO_HEIGHT = SCREEN_HEIGHT * 0.62;
const CARD_WIDTH = 280;
const CARD_GAP = 24;
const CARD_PADDING = 60;

interface TVHeroCarouselProps {
  items: BaseItemDto[];
  onItemFocus?: (item: BaseItemDto) => void;
}

interface HeroCardProps {
  item: BaseItemDto;
  isFirst: boolean;
  onFocus: (item: BaseItemDto) => void;
  onPress: (item: BaseItemDto) => void;
}

const HeroCard: React.FC<HeroCardProps> = React.memo(
  ({ item, isFirst, onFocus, onPress }) => {
    const api = useAtomValue(apiAtom);
    const [focused, setFocused] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;

    const posterUrl = useMemo(() => {
      if (!api) return null;
      // Try thumb first, then primary
      if (item.ImageTags?.Thumb) {
        return `${api.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=400&quality=80&tag=${item.ImageTags.Thumb}`;
      }
      if (item.ImageTags?.Primary) {
        return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=400&quality=80&tag=${item.ImageTags.Primary}`;
      }
      // For episodes, use series thumb
      if (item.Type === "Episode" && item.ParentThumbImageTag) {
        return `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Thumb?fillHeight=400&quality=80&tag=${item.ParentThumbImageTag}`;
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
      animateTo(1.08);
      onFocus(item);
    }, [animateTo, onFocus, item]);

    const handleBlur = useCallback(() => {
      setFocused(false);
      animateTo(1);
    }, [animateTo]);

    const handlePress = useCallback(() => {
      onPress(item);
    }, [onPress, item]);

    return (
      <Pressable
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={isFirst}
        style={{ marginRight: CARD_GAP }}
      >
        <Animated.View
          style={{
            width: CARD_WIDTH,
            aspectRatio: 16 / 9,
            borderRadius: 16,
            overflow: "hidden",
            transform: [{ scale }],
            borderWidth: focused ? 4 : 0,
            borderColor: "#FFFFFF",
            shadowColor: "#FFFFFF",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.5 : 0,
            shadowRadius: focused ? 20 : 0,
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
                size={48}
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
}) => {
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
      try {
        await Image.prefetch(backdropUrl);
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
    if (!activeItem || activeItem.Type !== "Episode") return null;
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
        onFocus={handleCardFocus}
        onPress={handleCardPress}
      />
    ),
    [handleCardFocus, handleCardPress],
  );

  // Memoize keyExtractor
  const keyExtractor = useCallback((item: BaseItemDto) => item.Id!, []);

  if (items.length === 0) return null;

  return (
    <View style={{ height: HERO_HEIGHT, width: "100%" }}>
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
      </View>

      {/* Content overlay */}
      <View
        style={{
          position: "absolute",
          left: insets.left + CARD_PADDING,
          right: insets.right + CARD_PADDING,
          bottom: 40,
        }}
      >
        {/* Logo or Title */}
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={{
              height: 100,
              width: SCREEN_WIDTH * 0.35,
              marginBottom: 16,
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
              marginBottom: 12,
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
              fontSize: TVTypography.body,
              color: "rgba(255,255,255,0.9)",
              marginBottom: 12,
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
              fontSize: TVTypography.body,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 16,
              maxWidth: SCREEN_WIDTH * 0.5,
              lineHeight: TVTypography.body * 1.4,
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
            gap: 16,
            marginBottom: 20,
          }}
        >
          {year && (
            <Text
              style={{
                fontSize: TVTypography.callout,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {year}
            </Text>
          )}
          {duration && (
            <Text
              style={{
                fontSize: TVTypography.callout,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {duration}
            </Text>
          )}
          {activeItem?.OfficialRating && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.5)",
              }}
            >
              <Text
                style={{
                  fontSize: TVTypography.callout,
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
                gap: 6,
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 4,
                  backgroundColor: "rgba(255,255,255,0.3)",
                  borderRadius: 2,
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
                  fontSize: TVTypography.callout,
                  color: "rgba(255,255,255,0.8)",
                }}
              >
                {Math.round(playedPercent)}%
              </Text>
            </View>
          )}
        </View>

        {/* Thumbnail carousel */}
        <FlatList
          horizontal
          data={heroItems}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          style={{ overflow: "visible" }}
          contentContainerStyle={{ paddingVertical: 12 }}
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
