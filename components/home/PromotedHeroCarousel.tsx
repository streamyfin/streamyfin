import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useRef } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  type PanGesture,
} from "react-native-gesture-handler";
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
import { useAppRouter } from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { runtimeTicksToMinutes } from "@/utils/time";

const CARD_SIDE_GUTTER = 16;
// How much of the neighboring card should peek in past its own gutter.
const NEIGHBOR_PEEK = 20;

// Past this width the card switches from a phone-style poster (backdrop with
// text overlaid at the bottom) to a wide banner (text panel + image side by
// side, à la the tvOS/iPadOS App Store hero) - the overlay reads cramped
// once there's this much extra horizontal room to use instead.
const WIDE_LAYOUT_BREAKPOINT = 700;
const WIDE_LEFT_PANEL_RATIO = 0.4;
// Fraction of the card's width (past the panel edge) the image takes to
// fully fade in from the panel's solid color.
const WIDE_GRADIENT_BLEND_RATIO = 0.2;
const CARD_BACKGROUND = "#0f0f10";
const CARD_BACKGROUND_RGB = "15, 15, 16"; // matches CARD_BACKGROUND
const CARD_BORDER = "#262626";

// Short/landscape windows (rotated phones, iPad Split View or Stage Manager)
// can make the poster layout's height rival or exceed the window itself.
// Past this fraction of the window's height the hero stops reading as a
// "hero" and just becomes an obstacle, so it hides itself rather than
// shrinking into something illegibly small.
const MAX_HERO_HEIGHT_RATIO = 0.8;

// Alpha doesn't fade linearly to the eye - a plain two-stop fade reads as if
// it's already halfway transparent right after the panel edge. Holding
// closer to opaque through the first half of the blend and only dropping
// off sharply near the end reads as a smooth, gradual fade instead.
const WIDE_GRADIENT_EASE: { t: number; alpha: number }[] = [
  { t: 0, alpha: 1 },
  { t: 0.25, alpha: 0.85 },
  { t: 0.5, alpha: 0.55 },
  { t: 0.75, alpha: 0.25 },
  { t: 1, alpha: 0 },
];

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const autoPlayIntervalMs =
    (settings?.heroCarouselRotationSeconds ?? 6) * 1000;

  const cappedItems = useMemo(() => items.slice(0, 8), [items]);

  // Everything below is derived purely from the current window width, so it
  // adapts live to rotation and iPad multitasking (Split View, Stage
  // Manager) with no phone/tablet branching.
  const isWide = windowWidth >= WIDE_LAYOUT_BREAKPOINT;
  const cardWidth = useMemo(
    () => windowWidth - CARD_SIDE_GUTTER * 2,
    [windowWidth],
  );
  const heroHeight = useMemo(() => {
    // Wide layout is a side-by-side banner - a fixed-ish height that scales
    // gently with width, clamped so it can't get too short or too tall.
    if (isWide)
      return Math.min(360, Math.max(240, Math.round(cardWidth / 2.6)));
    // Narrow layout is a poster: 16:9 backdrop plus room for the logo/title
    // + overview overlaid at the bottom.
    return Math.round(cardWidth * (9 / 16)) + 100;
  }, [cardWidth, isWide]);
  const sideGutter = CARD_SIDE_GUTTER;

  const renderItem = useCallback(
    ({ item }: { item: BaseItemDto }) => (
      <HeroSlide
        item={item}
        cardWidth={cardWidth}
        heroHeight={heroHeight}
        isWide={isWide}
      />
    ),
    [cardWidth, heroHeight, isWide],
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

  // Without this, the carousel's underlying pan gesture has no directional
  // restriction and will claim any drag - including a vertical scroll
  // attempt - before the parent ScrollView ever sees it. Restricting it to
  // horizontal movement lets a vertical drag fail fast here and fall
  // through to the ScrollView, while a horizontal drag still activates the
  // slide swipe normally.
  const configurePanGesture = useCallback((gesture: PanGesture) => {
    gesture.activeOffsetX([-10, 10]).failOffsetY([-10, 10]);
  }, []);

  const heroTooTall = heroHeight > windowHeight * MAX_HERO_HEIGHT_RATIO;

  if (cappedItems.length === 0 || heroTooTall) return null;

  return (
    <View>
      <Carousel
        ref={ref}
        autoPlay={isFocused && cappedItems.length > 1}
        autoPlayInterval={autoPlayIntervalMs}
        loop={cappedItems.length > 1}
        snapEnabled
        vertical={false}
        width={windowWidth}
        height={heroHeight}
        data={cappedItems}
        onConfigurePanGesture={configurePanGesture}
        mode='parallax'
        modeConfig={{
          parallaxScrollingScale: 0.96,
          parallaxScrollingOffset: sideGutter + NEIGHBOR_PEEK,
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

interface HeroSlideInfoProps {
  logoUrl: string | null;
  logoWidth: number;
  logoHeight: number;
  titleFontSize: number;
  displayTitle: string;
  episodeSubtitle: string | null;
  communityRating: string | null;
  year: string | null;
  duration: string | null;
  overview?: string | null;
  overviewLines: number;
  genres: string[];
  showGenres: boolean;
}

// Shared between both layouts below - only how it's positioned/sized
// (overlay vs. side panel) differs, not the metadata it shows.
const HeroSlideInfo: React.FC<HeroSlideInfoProps> = ({
  logoUrl,
  logoWidth,
  logoHeight,
  titleFontSize,
  displayTitle,
  episodeSubtitle,
  communityRating,
  year,
  duration,
  overview,
  overviewLines,
  genres,
  showGenres,
}) => (
  <>
    {logoUrl ? (
      <Image
        source={{ uri: logoUrl }}
        style={{ height: logoHeight, width: logoWidth, marginBottom: 8 }}
        contentFit='contain'
        contentPosition='left'
      />
    ) : (
      <Text
        style={{
          color: "#FFFFFF",
          fontWeight: "bold",
          fontSize: titleFontSize,
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
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            {communityRating}
          </Text>
        )}
        {year && (
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            {year}
          </Text>
        )}
        {duration && (
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
            {duration}
          </Text>
        )}
      </View>
    )}
    {overview && (
      <Text
        style={{ color: "rgba(255,255,255,0.8)" }}
        numberOfLines={overviewLines}
      >
        {overview}
      </Text>
    )}
    {showGenres && genres.length > 0 && <GenreTags genres={genres} />}
  </>
);

interface HeroSlideProps {
  item: BaseItemDto;
  cardWidth: number;
  heroHeight: number;
  isWide: boolean;
}

const HeroSlide: React.FC<HeroSlideProps> = React.memo(
  ({ item, cardWidth, heroHeight, isWide }) => {
    const api = useAtomValue(apiAtom);
    const router = useAppRouter();
    const lightHapticFeedback = useHaptic("light");
    // A scrim overlay rather than dimming the card's own opacity: the wide
    // layout's left panel is a solid near-black background, so fading its
    // opacity toward transparent is barely visible there while the image
    // side visibly dims - making the press feedback look like it only
    // applies to one half. An overlay painted on top of everything dims
    // both halves by the same visible amount.
    const pressOverlayOpacity = useSharedValue(0);

    const backdropUrl = useMemo(
      () =>
        getBackdropUrl({
          api,
          item,
          quality: 80,
          width: Math.floor(cardWidth * 2),
        }),
      [api, item, cardWidth],
    );

    const logoUrl = useMemo(
      () => getLogoImageUrlById({ api, item, height: isWide ? 72 : 56 }),
      [api, item, isWide],
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
    const genres = useMemo(
      () => (item.Genres || []).slice(0, 3),
      [item.Genres],
    );

    const handlePress = useCallback(() => {
      lightHapticFeedback();
      // This component only ever mounts on the Home screen, so "(home)" is
      // always the correct `from` segment - matches TVHeroCarousel's usage.
      router.push(getItemNavigation(item, "(home)") as any);
    }, [item, router, lightHapticFeedback]);

    const tap = Gesture.Tap()
      .maxDuration(2000)
      .shouldCancelWhenOutside(true)
      // No default distance limit exists on a tap gesture - without one, it
      // only fails once the touch leaves the card's bounds, which a
      // vertical scroll attempt often never does (it just moves up/down
      // within the same card). That let this gesture sit active for the
      // whole press, blocking the ScrollView above it from ever seeing the
      // touch. Failing fast on any real drag hands it off immediately.
      .maxDistance(10)
      .onBegin(() => {
        pressOverlayOpacity.value = withTiming(0.2, { duration: 100 });
      })
      .onEnd(() => {
        runOnJS(handlePress)();
      })
      .onFinalize(() => {
        pressOverlayOpacity.value = withTiming(0, { duration: 100 });
      });

    const leftPanelWidth = Math.round(cardWidth * WIDE_LEFT_PANEL_RATIO);
    const panelFraction = leftPanelWidth / cardWidth;
    // Explicit leading stop at the panel's solid color rather than relying
    // on the gradient to clamp before its first location - that clamping
    // isn't guaranteed across platforms, which is what left the transition
    // uneven. Everything from there on eases per WIDE_GRADIENT_EASE.
    const gradientColors = [
      CARD_BACKGROUND,
      ...WIDE_GRADIENT_EASE.map(
        ({ alpha }) => `rgba(${CARD_BACKGROUND_RGB}, ${alpha})`,
      ),
    ];
    const gradientLocations = [
      0,
      ...WIDE_GRADIENT_EASE.map(({ t }) =>
        Math.min(1, panelFraction + t * WIDE_GRADIENT_BLEND_RATIO),
      ),
    ];

    return (
      <View style={{ alignItems: "center" }}>
        <GestureDetector gesture={tap}>
          <Animated.View
            accessible
            accessibilityRole='button'
            accessibilityLabel={`Open ${displayTitle}`}
            accessibilityHint='Opens item details'
            accessibilityActions={[{ name: "activate" }]}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === "activate") handlePress();
            }}
            style={{
              width: cardWidth,
              height: heroHeight,
              borderRadius: 18,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: CARD_BORDER,
              backgroundColor: CARD_BACKGROUND,
            }}
          >
            {isWide ? (
              <>
                {/* The image spans the full card behind everything, and the
                    text panel is an opaque layer positioned on top of its
                    left portion - rather than two flex siblings meeting at a
                    computed edge, which left a hairline gap where the two
                    independently-rounded widths didn't quite meet. Painting
                    one fully over the other means there's no seam to line up
                    in the first place. */}
                {backdropUrl && (
                  <Image
                    source={{ uri: backdropUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit='cover'
                  />
                )}
                <LinearGradient
                  colors={gradientColors as [string, string, ...string[]]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  locations={gradientLocations as [number, number, ...number[]]}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  pointerEvents='none'
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: leftPanelWidth,
                    backgroundColor: CARD_BACKGROUND,
                    padding: 28,
                    justifyContent: "center",
                  }}
                >
                  <HeroSlideInfo
                    logoUrl={logoUrl}
                    logoWidth={leftPanelWidth * 0.85}
                    logoHeight={64}
                    titleFontSize={30}
                    displayTitle={displayTitle}
                    episodeSubtitle={episodeSubtitle}
                    communityRating={communityRating}
                    year={year}
                    duration={duration}
                    overview={item.Overview}
                    overviewLines={3}
                    genres={genres}
                    showGenres
                  />
                </View>
              </>
            ) : (
              <>
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
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 16,
                  }}
                >
                  <HeroSlideInfo
                    logoUrl={logoUrl}
                    logoWidth={cardWidth * 0.6}
                    logoHeight={56}
                    titleFontSize={26}
                    displayTitle={displayTitle}
                    episodeSubtitle={episodeSubtitle}
                    communityRating={communityRating}
                    year={year}
                    duration={duration}
                    overview={item.Overview}
                    overviewLines={2}
                    genres={genres}
                    showGenres={false}
                  />
                </View>
              </>
            )}
            <Animated.View
              pointerEvents='none'
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "#000000", opacity: pressOverlayOpacity },
              ]}
            />
            <ProgressBar item={item} />
          </Animated.View>
        </GestureDetector>
      </View>
    );
  },
);
