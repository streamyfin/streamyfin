import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { ItemImage } from "./common/ItemImage";
import type { SelectedOptions } from "./ItemContent";
import { PlayButton } from "./PlayButton";
import { PlayedStatus } from "./PlayedStatus";

interface AppleTVCarouselProps {
  items: BaseItemDto[];
  initialIndex?: number;
  onItemChange?: (index: number) => void;
  loading?: boolean;
}

const { width: screenWidth } = Dimensions.get("window");

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
    width: withTiming(isActive ? 24 : 12, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    }),
    opacity: withTiming(isActive ? 1 : 0.6, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    }),
  }));

  return (
    <Pressable
      onPress={() => onPress(index)}
      style={{
        padding: 4, // Increase touch area
      }}
    >
      <Animated.View
        style={[
          {
            height: 6,
            backgroundColor: isActive ? "white" : "rgba(255, 255, 255, 0.4)",
            borderRadius: 3,
          },
          animatedStyle,
        ]}
      />
    </Pressable>
  );
};

export const AppleTVCarousel: React.FC<AppleTVCarouselProps> = ({
  items,
  initialIndex = 0,
  onItemChange,
  loading = false,
}) => {
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const [api] = useAtom(apiAtom);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const translateX = useSharedValue(-currentIndex * screenWidth);

  // Only get play settings if we have valid items
  const currentItem = items && items.length > 0 ? items[currentIndex] : null;

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
    }
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
    currentIndex,
    currentItem,
  ]);

  const goToIndex = useCallback(
    (index: number) => {
      if (!items || index < 0 || index >= items.length) return;

      translateX.value = withTiming(-index * screenWidth, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });

      setCurrentIndex(index);
      onItemChange?.(index);
    },
    [items, onItemChange, translateX],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // More responsive horizontal gestures
    .onUpdate((event) => {
      translateX.value = -currentIndex * screenWidth + event.translationX;
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      const translation = event.translationX;

      let newIndex = currentIndex;

      if (Math.abs(translation) > screenWidth / 3 || Math.abs(velocity) > 500) {
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

  const renderDots = () => {
    if (!items || items.length <= 1) return null;

    return (
      <View
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
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
          height: 600,
          backgroundColor: "#000",
        }}
      >
        {/* Background Skeleton */}
        <View
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#1a1a1a",
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
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          }}
        />

        {/* Gradient Fade to Black Skeleton */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)", "rgba(0,0,0,1)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 200,
          }}
        />

        {/* Logo Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: 180,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            alignItems: "center",
          }}
        >
          <View
            style={{
              height: 80,
              width: "80%",
              backgroundColor: "#333",
              borderRadius: 8,
            }}
          />
        </View>

        {/* Genres Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: 140,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            alignItems: "center",
          }}
        >
          <View
            style={{
              height: 20,
              width: 200,
              backgroundColor: "#333",
              borderRadius: 4,
            }}
          />
        </View>

        {/* Controls Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: 100,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 20,
          }}
        >
          {/* Play Button Skeleton */}
          <View
            style={{
              height: 50,
              flex: 1,
              maxWidth: 300,
              backgroundColor: "#333",
              borderRadius: 25,
            }}
          />

          {/* Played Status Skeleton */}
          <View
            style={{
              width: 40,
              height: 40,
              backgroundColor: "#333",
              borderRadius: 20,
            }}
          />
        </View>

        {/* Navigation Counter Skeleton */}
        <View
          style={{
            position: "absolute",
            top: 60 + insets.top,
            right: 20,
            backgroundColor: "#333",
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          <View
            style={{
              width: 40,
              height: 16,
              backgroundColor: "#666",
              borderRadius: 4,
            }}
          />
        </View>

        {/* Dots Skeleton */}
        <View
          style={{
            position: "absolute",
            bottom: 60,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          {[1, 2, 3].map((_, index) => (
            <View
              key={index}
              style={{
                width: index === 0 ? 24 : 12,
                height: 6,
                backgroundColor: index === 0 ? "#666" : "#333",
                borderRadius: 3,
              }}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderItem = (item: BaseItemDto, index: number) => {
    const itemLogoUrl = api ? getLogoImageUrlById({ api, item }) : null;

    return (
      <View
        key={item.Id}
        style={{
          width: screenWidth,
          height: 600,
          position: "relative",
        }}
      >
        {/* Background Backdrop */}
        <ItemImage
          item={item}
          variant='Backdrop'
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
          }}
        />

        {/* Dark Overlay */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.4)",
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
            height: 200,
          }}
        />

        {/* Logo Section */}
        {itemLogoUrl && (
          <View
            style={{
              position: "absolute",
              bottom: 180,
              left: 0,
              right: 0,
              paddingHorizontal: 20,
              alignItems: "center",
            }}
          >
            <Image
              source={{
                uri: itemLogoUrl,
              }}
              style={{
                height: 80,
                width: "80%",
              }}
              contentFit='contain'
            />
          </View>
        )}

        {/* Genres Section */}
        {item.Genres && item.Genres.length > 0 && (
          <View
            style={{
              position: "absolute",
              bottom: 140,
              left: 0,
              right: 0,
              paddingHorizontal: 20,
              alignItems: "center",
            }}
          >
            <Animated.Text
              style={{
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: 16,
                fontWeight: "500",
                textAlign: "center",
                textShadowColor: "rgba(0, 0, 0, 0.8)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}
            >
              {item.Genres.slice(0, 2).join(" • ")}
            </Animated.Text>
          </View>
        )}

        {/* Controls Section */}
        <View
          style={{
            position: "absolute",
            bottom: 100,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 20,
            }}
          >
            {/* Play Button */}
            <View style={{ flex: 1, maxWidth: 300 }}>
              {selectedOptions && (
                <PlayButton item={item} selectedOptions={selectedOptions} />
              )}
            </View>

            {/* Mark as Played */}
            <PlayedStatus items={[item]} size='large' />
          </View>
        </View>

        {/* Navigation Indicators */}
        <View
          style={{
            position: "absolute",
            top: 60 + insets.top,
            right: 20,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
            zIndex: 50,
          }}
        >
          <Animated.Text
            style={{
              color: "white",
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            {index + 1} / {items.length}
          </Animated.Text>
        </View>
      </View>
    );
  };

  // Handle loading state
  if (loading) {
    return (
      <View
        style={{
          height: 600,
          backgroundColor: "#000",
          overflow: "hidden",
        }}
      >
        {renderSkeletonLoader()}
      </View>
    );
  }

  // Handle empty items
  if (!items || items.length === 0) {
    return (
      <View
        style={{
          height: 600,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#000",
        }}
      >
        <Ionicons name='film-outline' size={64} color='#666' />
        <Animated.Text
          style={{
            color: "#666",
            fontSize: 18,
            marginTop: 16,
          }}
        >
          No items available
        </Animated.Text>
      </View>
    );
  }

  return (
    <View
      style={{
        height: 600, // Fixed height instead of flex: 1
        backgroundColor: "#000",
        overflow: "hidden",
      }}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              height: 600, // Fixed height instead of flex: 1
              flexDirection: "row",
              width: screenWidth * items.length,
            },
            containerAnimatedStyle,
          ]}
        >
          {items.map((item, index) => renderItem(item, index))}
        </Animated.View>
      </GestureDetector>

      {/* Side Navigation Hints */}
      {currentIndex > 0 && (
        <Pressable
          onPress={() => goToIndex(currentIndex - 1)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 60,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: 20,
              padding: 8,
            }}
          >
            <Ionicons name='chevron-back' size={24} color='white' />
          </View>
        </Pressable>
      )}

      {currentIndex < items.length - 1 && (
        <Pressable
          onPress={() => goToIndex(currentIndex + 1)}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 60,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderRadius: 20,
              padding: 8,
            }}
          >
            <Ionicons name='chevron-forward' size={24} color='white' />
          </View>
        </Pressable>
      )}

      {/* Animated Dots Indicator */}
      {renderDots()}
    </View>
  );
};
