import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { ItemImage } from "./common/ItemImage";
import { getItemNavigation } from "./common/TouchableItemRouter";
import type { SelectedOptions } from "./ItemContent";
import { PlayButton } from "./PlayButton";
import { PlayedStatus } from "./PlayedStatus";

interface AppleTVCarouselProps {
  initialIndex?: number;
  onItemChange?: (index: number) => void;
  scrollOffset?: SharedValue<number>;
}

// Layout Constants
const GRADIENT_HEIGHT_TOP = 150;
const GRADIENT_HEIGHT_BOTTOM = 150;
const LOGO_HEIGHT = 80;

// Position Constants
const LOGO_BOTTOM_POSITION = 210;
const GENRES_BOTTOM_POSITION = 170;
const CONTROLS_BOTTOM_POSITION = 100;
const DOTS_BOTTOM_POSITION = 60;

// Size Constants
const DOT_HEIGHT = 6;
const DOT_ACTIVE_WIDTH = 20;
const DOT_INACTIVE_WIDTH = 12;
const PLAY_BUTTON_SKELETON_HEIGHT = 50;
const PLAYED_STATUS_SKELETON_SIZE = 40;
const TEXT_SKELETON_HEIGHT = 20;
const TEXT_SKELETON_WIDTH = 250;
const _EMPTY_STATE_ICON_SIZE = 64;

// Spacing Constants
const HORIZONTAL_PADDING = 40;
const DOT_PADDING = 2;
const DOT_GAP = 4;
const CONTROLS_GAP = 20;
const _TEXT_MARGIN_TOP = 16;

// Border Radius Constants
const DOT_BORDER_RADIUS = 3;
const LOGO_SKELETON_BORDER_RADIUS = 8;
const TEXT_SKELETON_BORDER_RADIUS = 4;
const PLAY_BUTTON_BORDER_RADIUS = 25;
const PLAYED_STATUS_BORDER_RADIUS = 20;

// Animation Constants
const DOT_ANIMATION_DURATION = 300;
const CAROUSEL_TRANSITION_DURATION = 250;
const PAN_ACTIVE_OFFSET = 10;
const TRANSLATION_THRESHOLD = 0.2;
const VELOCITY_THRESHOLD = 400;

// Text Constants
const GENRES_FONT_SIZE = 16;
const _EMPTY_STATE_FONT_SIZE = 18;
const TEXT_SHADOW_RADIUS = 2;
const MAX_GENRES_COUNT = 2;
const MAX_BUTTON_WIDTH = 300;

// Opacity Constants
const OVERLAY_OPACITY = 0.4;
const DOT_INACTIVE_OPACITY = 0.6;
const TEXT_OPACITY = 0.9;

// Color Constants
const SKELETON_BACKGROUND_COLOR = "#1a1a1a";
const SKELETON_ELEMENT_COLOR = "#333";
const SKELETON_ACTIVE_DOT_COLOR = "#666";
const _EMPTY_STATE_COLOR = "#666";
const TEXT_SHADOW_COLOR = "rgba(0, 0, 0, 0.8)";
const LOGO_WIDTH_PERCENTAGE = "80%";

const DotIndicator = ({
  index,
  currentIndex,
  onPress,
}: {
  index: number;
  currentIndex: number;
  onPress: (index: number) => void;
}) => {
  const isActive = index === currentIndex;

  const animatedStyle = useAnimatedStyle(() => ({
    width: withTiming(isActive ? DOT_ACTIVE_WIDTH : DOT_INACTIVE_WIDTH, {
      duration: DOT_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
    }),
    opacity: withTiming(isActive ? 1 : DOT_INACTIVE_OPACITY, {
      duration: DOT_ANIMATION_DURATION,
      easing: Easing.out(Easing.quad),
    }),
  }));

  return (
    <Pressable
      onPress={() => onPress(index)}
      style={{
        padding: DOT_PADDING, // Increase touch area
      }}
    >
      <Animated.View
        style={[
          {
            height: DOT_HEIGHT,
            backgroundColor: isActive ? "white" : "rgba(255, 255, 255, 0.4)",
            borderRadius: DOT_BORDER_RADIUS,
          },
          animatedStyle,
        ]}
      />
    </Pressable>
  );
};

export const AppleTVCarousel: React.FC<AppleTVCarouselProps> = ({
  initialIndex = 0,
  onItemChange,
  scrollOffset,
}) => {
  const { settings } = useSettings();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isLandscape = screenWidth >= screenHeight;
  const carouselHeight = useMemo(
    () => (isLandscape ? screenHeight * 0.9 : screenHeight / 1.45),
    [isLandscape, screenHeight],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const translateX = useSharedValue(-initialIndex * screenWidth);

  const isQueryEnabled =
    !!api && !!user?.Id && isConnected && serverConnected === true;

  const { data: continueWatchingData, isLoading: continueWatchingLoading } =
    useQuery({
      queryKey: ["appleTVCarousel", "continueWatching", user?.Id],
      queryFn: async () => {
        if (!api || !user?.Id) return [];
        const response = await getItemsApi(api).getResumeItems({
          userId: user.Id,
          enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
          includeItemTypes: ["Movie", "Series", "Episode"],
          fields: ["Genres"],
          limit: 2,
        });
        return response.data.Items || [];
      },
      enabled: isQueryEnabled,
      staleTime: 60 * 1000,
    });

  const { data: nextUpData, isLoading: nextUpLoading } = useQuery({
    queryKey: ["appleTVCarousel", "nextUp", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];
      const response = await getTvShowsApi(api).getNextUp({
        userId: user.Id,
        fields: ["MediaSourceCount", "Genres"],
        limit: 2,
        enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
        enableResumable: false,
      });
      return response.data.Items || [];
    },
    enabled: isQueryEnabled,
    staleTime: 60 * 1000,
  });

  const { data: recentlyAddedData, isLoading: recentlyAddedLoading } = useQuery(
    {
      queryKey: ["appleTVCarousel", "recentlyAdded", user?.Id],
      queryFn: async () => {
        if (!api || !user?.Id) return [];
        const response = await getUserLibraryApi(api).getLatestMedia({
          userId: user.Id,
          limit: 2,
          fields: ["PrimaryImageAspectRatio", "Path", "Genres"],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb", "Logo"],
        });
        return response.data || [];
      },
      enabled: isQueryEnabled,
      staleTime: 60 * 1000,
    },
  );

  const items = useMemo(() => {
    const continueItems = continueWatchingData ?? [];
    const nextItems = nextUpData ?? [];
    const recentItems = recentlyAddedData ?? [];

    return [
      ...continueItems.slice(0, 2),
      ...nextItems.slice(0, 2),
      ...recentItems.slice(0, 2),
    ];
  }, [continueWatchingData, nextUpData, recentlyAddedData]);

  const isLoading =
    continueWatchingLoading || nextUpLoading || recentlyAddedLoading;
  const hasItems = items.length > 0;

  // Only get play settings if we have valid items
  const currentItem = hasItems ? items[currentIndex] : null;

  // Extract colors for the current item only (for performance)
  const currentItemColors = useImageColorsReturn({ item: currentItem });

  // Create a fallback empty item for useDefaultPlaySettings when no item is available
  const itemForPlaySettings = currentItem || { MediaSources: [] };
  const {
    defaultAudioIndex,
    defaultBitrate,
    defaultMediaSource,
    defaultSubtitleIndex,
  } = useDefaultPlaySettings(itemForPlaySettings as BaseItemDto, settings);

  const [selectedOptions, setSelectedOptions] = useState<
    SelectedOptions | undefined
  >(undefined);

  useEffect(() => {
    // Only set options if we have valid current item
    if (currentItem) {
      setSelectedOptions({
        bitrate: defaultBitrate,
        mediaSource: defaultMediaSource,
        subtitleIndex: defaultSubtitleIndex ?? -1,
        audioIndex: defaultAudioIndex,
      });
    } else {
      setSelectedOptions(undefined);
    }
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
    currentIndex,
    currentItem,
  ]);

  useEffect(() => {
    if (!hasItems) {
      setCurrentIndex(initialIndex);
      translateX.value = -initialIndex * screenWidth;
      return;
    }

    setCurrentIndex((prev) => {
      const newIndex = Math.min(prev, items.length - 1);
      translateX.value = -newIndex * screenWidth;
      return newIndex;
    });
  }, [hasItems, items, initialIndex, screenWidth, translateX]);

  useEffect(() => {
    translateX.value = -currentIndex * screenWidth;
  }, [currentIndex, screenWidth, translateX]);

  useEffect(() => {
    if (hasItems) {
      onItemChange?.(currentIndex);
    }
  }, [hasItems, currentIndex, onItemChange]);

  const goToIndex = useCallback(
    (index: number) => {
      if (!hasItems || index < 0 || index >= items.length) return;

      translateX.value = withTiming(-index * screenWidth, {
        duration: CAROUSEL_TRANSITION_DURATION, // Slightly longer for smoother feel
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), // iOS-like smooth deceleration curve
      });

      setCurrentIndex(index);
      onItemChange?.(index);
    },
    [hasItems, items, onItemChange, screenWidth, translateX],
  );

  const navigateToItem = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, "(home)");
      router.push(navigation as any);
    },
    [router],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-PAN_ACTIVE_OFFSET, PAN_ACTIVE_OFFSET])
    .onUpdate((event) => {
      translateX.value = -currentIndex * screenWidth + event.translationX;
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      const translation = event.translationX;

      let newIndex = currentIndex;

      // Improved thresholds for more responsive navigation
      if (
        Math.abs(translation) > screenWidth * TRANSLATION_THRESHOLD ||
        Math.abs(velocity) > VELOCITY_THRESHOLD
      ) {
        if (translation > 0 && currentIndex > 0) {
          newIndex = currentIndex - 1;
        } else if (
          translation < 0 &&
          items &&
          currentIndex < items.length - 1
        ) {
          newIndex = currentIndex + 1;
        }
      }

      runOnJS(goToIndex)(newIndex);
    });

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    if (!scrollOffset) return {};
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-carouselHeight, 0, carouselHeight],
            [-carouselHeight / 2, 0, carouselHeight * 0.75],
          ),
        },
        {
          scale: interpolate(
            scrollOffset.value,
            [-carouselHeight, 0, carouselHeight],
            [2, 1, 1],
          ),
        },
      ],
    };
  });

  const renderDots = () => {
    if (!hasItems || items.length <= 1) return null;

    return (
      <View
        style={{
          position: "absolute",
          bottom: DOTS_BOTTOM_POSITION,
          left: 0,
          right: 0,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: DOT_GAP,
        }}
      >
        {items.map((_, index) => (
          <DotIndicator
            key={index}
            index={index}
            currentIndex={currentIndex}
            onPress={goToIndex}
          />
        ))}
      </View>
    );
  };

  const renderSkeletonLoader = () => {
    return (
      <View
        style={{
          width: screenWidth,
          height: carouselHeight,
          backgroundColor: "#000",
        }}
      >
        {/* Background Skeleton */}
        <View
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: SKELETON_BACKGROUND_COLOR,
            position: "absolute",
          }}
        />

        {/* Dark Overlay Skeleton */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: `rgba(0, 0, 0, ${OVERLAY_OPACITY})`,
          }}
        />

        {/* Gradient Fade to Black Top Skeleton */}
        <LinearGradient
          colors={["rgba(0,0,0,1)", "rgba(0,0,0,0.8)", "transparent"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: GRADIENT_HEIGHT_TOP,
          }}
        />

        {/* Gradient Fade to Black Bottom Skeleton */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)", "rgba(0,0,0,1)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: GRADIENT_HEIGHT_BOTTOM,
          }}
        />

        {/* Logo Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: LOGO_BOTTOM_POSITION,
            left: 0,
            right: 0,
            paddingHorizontal: HORIZONTAL_PADDING,
            alignItems: "center",
          }}
        >
          <View
            style={{
              height: LOGO_HEIGHT,
              width: LOGO_WIDTH_PERCENTAGE,
              backgroundColor: SKELETON_ELEMENT_COLOR,
              borderRadius: LOGO_SKELETON_BORDER_RADIUS,
            }}
          />
        </View>

        {/* Type and Genres Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: GENRES_BOTTOM_POSITION,
            left: 0,
            right: 0,
            paddingHorizontal: HORIZONTAL_PADDING,
            alignItems: "center",
          }}
        >
          <View
            style={{
              height: TEXT_SKELETON_HEIGHT,
              width: TEXT_SKELETON_WIDTH,
              backgroundColor: SKELETON_ELEMENT_COLOR,
              borderRadius: TEXT_SKELETON_BORDER_RADIUS,
            }}
          />
        </View>

        {/* Controls Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: CONTROLS_BOTTOM_POSITION,
            left: 0,
            right: 0,
            paddingHorizontal: HORIZONTAL_PADDING,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: CONTROLS_GAP,
          }}
        >
          {/* Play Button Skeleton */}
          <View
            style={{
              height: PLAY_BUTTON_SKELETON_HEIGHT,
              flex: 1,
              maxWidth: MAX_BUTTON_WIDTH,
              backgroundColor: SKELETON_ELEMENT_COLOR,
              borderRadius: PLAY_BUTTON_BORDER_RADIUS,
            }}
          />

          {/* Played Status Skeleton */}
          <View
            style={{
              width: PLAYED_STATUS_SKELETON_SIZE,
              height: PLAYED_STATUS_SKELETON_SIZE,
              backgroundColor: SKELETON_ELEMENT_COLOR,
              borderRadius: PLAYED_STATUS_BORDER_RADIUS,
            }}
          />
        </View>

        {/* Dots Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: DOTS_BOTTOM_POSITION,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: DOT_GAP,
          }}
        >
          {[1, 2, 3].map((_, index) => (
            <View
              key={index}
              style={{
                width: index === 0 ? DOT_ACTIVE_WIDTH : DOT_INACTIVE_WIDTH,
                height: DOT_HEIGHT,
                backgroundColor:
                  index === 0
                    ? SKELETON_ACTIVE_DOT_COLOR
                    : SKELETON_ELEMENT_COLOR,
                borderRadius: DOT_BORDER_RADIUS,
              }}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderItem = (item: BaseItemDto, _index: number) => {
    const itemLogoUrl = api ? getLogoImageUrlById({ api, item }) : null;

    return (
      <View
        key={item.Id}
        style={{
          width: screenWidth,
          height: carouselHeight,
          position: "relative",
        }}
      >
        {/* Background Backdrop */}
        <Animated.View
          style={[
            {
              width: "100%",
              height: "100%",
              position: "absolute",
            },
            headerAnimatedStyle,
          ]}
        >
          <ItemImage
            item={item}
            variant='Backdrop'
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        </Animated.View>

        {/* Dark Overlay */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: `rgba(0, 0, 0, ${OVERLAY_OPACITY})`,
          }}
        />

        {/* Gradient Fade to Black at Top */}
        <LinearGradient
          colors={["rgba(0,0,0,1)", "rgba(0,0,0,0.2)", "transparent"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: GRADIENT_HEIGHT_TOP,
          }}
        />

        {/* Gradient Fade to Black at Bottom */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)", "rgba(0,0,0,1)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: GRADIENT_HEIGHT_BOTTOM,
          }}
        />

        {/* Logo Section */}
        {itemLogoUrl && (
          <TouchableOpacity
            onPress={() => navigateToItem(item)}
            style={{
              position: "absolute",
              bottom: LOGO_BOTTOM_POSITION,
              left: 0,
              right: 0,
              paddingHorizontal: HORIZONTAL_PADDING,
              alignItems: "center",
            }}
          >
            <Image
              source={{
                uri: itemLogoUrl,
              }}
              style={{
                height: LOGO_HEIGHT,
                width: LOGO_WIDTH_PERCENTAGE,
              }}
              contentFit='contain'
            />
          </TouchableOpacity>
        )}

        {/* Type and Genres Section */}
        <View
          style={{
            position: "absolute",
            bottom: GENRES_BOTTOM_POSITION,
            left: 0,
            right: 0,
            paddingHorizontal: HORIZONTAL_PADDING,
            alignItems: "center",
          }}
        >
          <TouchableOpacity onPress={() => navigateToItem(item)}>
            <Animated.Text
              style={{
                color: `rgba(255, 255, 255, ${TEXT_OPACITY})`,
                fontSize: GENRES_FONT_SIZE,
                fontWeight: "500",
                textAlign: "center",
                textShadowColor: TEXT_SHADOW_COLOR,
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: TEXT_SHADOW_RADIUS,
              }}
            >
              {(() => {
                let typeLabel = "";

                if (item.Type === "Episode") {
                  // For episodes, show season and episode number
                  const season = item.ParentIndexNumber;
                  const episode = item.IndexNumber;
                  if (season && episode) {
                    typeLabel = `S${season} • E${episode}`;
                  } else {
                    typeLabel = "Episode";
                  }
                } else {
                  typeLabel =
                    item.Type === "Series"
                      ? "TV Show"
                      : item.Type === "Movie"
                        ? "Movie"
                        : item.Type || "";
                }

                const genres =
                  item.Genres && item.Genres.length > 0
                    ? item.Genres.slice(0, MAX_GENRES_COUNT).join(" • ")
                    : "";

                if (typeLabel && genres) {
                  return `${typeLabel} • ${genres}`;
                } else if (typeLabel) {
                  return typeLabel;
                } else if (genres) {
                  return genres;
                } else {
                  return "";
                }
              })()}
            </Animated.Text>
          </TouchableOpacity>
        </View>

        {/* Controls Section */}
        <View
          style={{
            position: "absolute",
            bottom: CONTROLS_BOTTOM_POSITION,
            left: 0,
            right: 0,
            paddingHorizontal: HORIZONTAL_PADDING,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: CONTROLS_GAP,
            }}
          >
            {/* Play Button */}
            <View style={{ flex: 1, maxWidth: MAX_BUTTON_WIDTH }}>
              {selectedOptions && (
                <PlayButton
                  item={item}
                  selectedOptions={selectedOptions}
                  colors={currentItemColors}
                />
              )}
            </View>

            {/* Mark as Played */}
            <PlayedStatus items={[item]} size='large' />
          </View>
        </View>
      </View>
    );
  };

  // Handle loading state
  if (isLoading) {
    return (
      <View
        style={{
          height: carouselHeight,
          backgroundColor: "#000",
          overflow: "hidden",
        }}
      >
        {renderSkeletonLoader()}
      </View>
    );
  }

  // Handle empty items
  if (!hasItems) {
    return null;
  }

  return (
    <View
      style={{
        height: carouselHeight, // Fixed height instead of flex: 1
        backgroundColor: "#000",
        overflow: "hidden",
      }}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              height: carouselHeight, // Fixed height instead of flex: 1
              flexDirection: "row",
              width: screenWidth * items.length,
            },
            containerAnimatedStyle,
          ]}
        >
          {items.map((item, index) => renderItem(item, index))}
        </Animated.View>
      </GestureDetector>

      {/* Animated Dots Indicator */}
      {renderDots()}
    </View>
  );
};
