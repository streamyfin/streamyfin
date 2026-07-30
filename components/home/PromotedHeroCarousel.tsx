import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useRef } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Carousel, {
  type ICarouselInstance,
  Pagination,
} from "react-native-reanimated-carousel";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { GenreTags } from "@/components/GenreTags";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Cards are inset from the screen edges so neighboring slides peek in via
// the parallax carousel mode.
const HERO_CARD_WIDTH = SCREEN_WIDTH - 32;
// 16:9 backdrop plus room for the logo/title + overview overlay.
const HERO_HEIGHT = Math.round(HERO_CARD_WIDTH * (9 / 16)) + 100;

const getYear = (item: BaseItemDto): string | null => {
  if (item.ProductionYear) return item.ProductionYear.toString();
  if (!item.PremiereDate) return null;

  const parsed = new Date(item.PremiereDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear().toString();
};

interface PromotedHeroCarouselProps {
  items: BaseItemDto[];
}

export const PromotedHeroCarousel: React.FC<PromotedHeroCarouselProps> = ({
  items,
}) => {
  const isFocused = useIsFocused();
  const ref = useRef<ICarouselInstance>(null);
  const progress = useSharedValue(0);
  const { settings } = useSettings();
  const autoPlayIntervalMs =
    (settings?.heroCarouselRotationSeconds ?? 6) * 1000;

  const cappedItems = useMemo(() => items.slice(0, 8), [items]);

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => <HeroSlide item={item} />,
    [],
  );

  const onPressPagination = useCallback(
    (index: number) => {
      ref.current?.scrollTo({
        count: index - progress.value,
        animated: true,
      });
    },
    [progress],
  );

  if (cappedItems.length === 0) return null;

  return (
    <View>
      <Carousel
        ref={ref}
        autoPlay={isFocused && cappedItems.length > 1}
        autoPlayInterval={autoPlayIntervalMs}
        loop={cappedItems.length > 1}
        snapEnabled
        vertical={false}
        width={SCREEN_WIDTH}
        height={HERO_HEIGHT}
        data={cappedItems}
        mode='parallax'
        modeConfig={{
          parallaxScrollingScale: 0.96,
          parallaxScrollingOffset: 36,
        }}
        onProgressChange={progress}
        renderItem={renderItem}
        scrollAnimationDuration={600}
      />
      {cappedItems.length > 1 && (
        <Pagination.Basic
          progress={progress}
          data={cappedItems}
          dotStyle={{
            backgroundColor: "rgba(255,255,255,0.25)",
            borderRadius: 99,
          }}
          activeDotStyle={{
            backgroundColor: "rgba(255,255,255,0.85)",
            borderRadius: 99,
          }}
          containerStyle={{ gap: 5, marginTop: 12 }}
          onPress={onPressPagination}
        />
      )}
    </View>
  );
};

const HeroSlide: React.FC<{ item: BaseItemDto }> = React.memo(({ item }) => {
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");
  const opacity = useSharedValue(1);

  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 80,
        width: Math.floor(HERO_CARD_WIDTH * 2),
      }),
    [api, item],
  );

  const logoUrl = useMemo(
    () => getLogoImageUrlById({ api, item, height: 56 }),
    [api, item],
  );

  const displayTitle =
    item.Type === "Episode"
      ? item.SeriesName || item.Name || ""
      : item.Name || "";

  const episodeSubtitle =
    item.Type === "Episode"
      ? `S${item.ParentIndexNumber} E${item.IndexNumber} · ${item.Name}`
      : null;

  const year = useMemo(() => getYear(item), [item]);
  const duration = item.RunTimeTicks
    ? runtimeTicksToMinutes(item.RunTimeTicks)
    : null;
  const communityRating =
    typeof item.CommunityRating === "number"
      ? `★ ${item.CommunityRating.toFixed(1)}`
      : null;
  const genres = useMemo(() => (item.Genres || []).slice(0, 3), [item.Genres]);

  const handlePress = useCallback(() => {
    lightHapticFeedback();
    // This component only ever mounts on the Home screen, so "(home)" is
    // always the correct `from` segment - matches TVHeroCarousel's usage.
    router.push(getItemNavigation(item, "(home)") as any);
  }, [item, router, lightHapticFeedback]);

  const tap = Gesture.Tap()
    .maxDuration(2000)
    .shouldCancelWhenOutside(true)
    .onBegin(() => {
      opacity.value = withTiming(0.8, { duration: 100 });
    })
    .onEnd(() => {
      runOnJS(handlePress)();
    })
    .onFinalize(() => {
      opacity.value = withTiming(1, { duration: 100 });
    });

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <GestureDetector gesture={tap}>
        <Animated.View
          style={{
            width: HERO_CARD_WIDTH,
            height: HERO_HEIGHT,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "#262626",
            backgroundColor: "#0f0f10",
            opacity,
          }}
        >
          {backdropUrl && (
            <Image
              source={{ uri: backdropUrl }}
              style={StyleSheet.absoluteFill}
              contentFit='cover'
            />
          )}
          <View
            style={{
              position: "absolute",
              width: "100%",
              height: "100%",
              backgroundColor: "rgba(0,0,0,0.35)",
            }}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.92)"]}
            locations={[0.4, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "65%",
            }}
          />
          <View
            style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}
          >
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={{
                  height: 56,
                  width: HERO_CARD_WIDTH * 0.6,
                  marginBottom: 8,
                }}
                contentFit='contain'
                contentPosition='left'
              />
            ) : (
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "bold",
                  fontSize: 26,
                  marginBottom: 8,
                }}
                numberOfLines={1}
              >
                {displayTitle}
              </Text>
            )}
            {episodeSubtitle && (
              <Text
                style={{ color: "rgba(255,255,255,0.9)", marginBottom: 4 }}
                numberOfLines={1}
              >
                {episodeSubtitle}
              </Text>
            )}
            {(communityRating || year || duration) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                {communityRating && (
                  <Text
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}
                  >
                    {communityRating}
                  </Text>
                )}
                {year && (
                  <Text
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}
                  >
                    {year}
                  </Text>
                )}
                {duration && (
                  <Text
                    style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}
                  >
                    {duration}
                  </Text>
                )}
              </View>
            )}
            {item.Overview && (
              <Text
                style={{ color: "rgba(255,255,255,0.8)" }}
                numberOfLines={2}
              >
                {item.Overview}
              </Text>
            )}
            {genres.length > 0 && <GenreTags genres={genres} />}
          </View>
          <ProgressBar item={item} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});
