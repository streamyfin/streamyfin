import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback, useEffect, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useSettings } from "@/utils/atoms/settings";
import { ItemImage } from "./common/ItemImage";
import type { SelectedOptions } from "./ItemContent";
import { PlayButton } from "./PlayButton";
import { PlayedStatus } from "./PlayedStatus";

interface AppleTVCarouselProps {
  items: BaseItemDto[];
  initialIndex?: number;
  onItemChange?: (index: number) => void;
}

const { width: screenWidth } = Dimensions.get("window");

export const AppleTVCarousel: React.FC<AppleTVCarouselProps> = ({
  items,
  initialIndex = 0,
  onItemChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const translateX = useSharedValue(-currentIndex * screenWidth);
  const { settings } = useSettings();
  const {
    defaultAudioIndex,
    defaultBitrate,
    defaultMediaSource,
    defaultSubtitleIndex,
  } = useDefaultPlaySettings(items[currentIndex], settings);

  const [selectedOptions, setSelectedOptions] = useState<
    SelectedOptions | undefined
  >(undefined);

  useEffect(() => {
    setSelectedOptions({
      bitrate: defaultBitrate,
      mediaSource: defaultMediaSource,
      subtitleIndex: defaultSubtitleIndex ?? -1,
      audioIndex: defaultAudioIndex,
    });
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
    currentIndex,
  ]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return;

      translateX.value = withSpring(-index * screenWidth, {
        damping: 20,
        stiffness: 300,
      });

      setCurrentIndex(index);
      onItemChange?.(index);
    },
    [items.length, onItemChange, translateX],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10]) // Only activate for horizontal gestures
    .failOffsetY([-10, 10]) // Fail for vertical gestures to allow parent scrolling
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
        } else if (translation < 0 && currentIndex < items.length - 1) {
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

  const renderItem = (item: BaseItemDto, index: number) => {
    return (
      <View
        key={item.Id}
        style={{
          width: screenWidth,
          height: 500,
          position: "relative",
        }}
      >
        {/* Background Poster */}
        <ItemImage
          item={item}
          variant='Backdrop'
          style={{
            width: screenWidth,
            height: 500,
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

        {/* Content Overlay */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingBottom: 20,
            paddingTop: 60,
          }}
        >
          {/* Movie Poster */}
          <View
            style={{
              alignItems: "center",
              marginBottom: 30,
            }}
          >
            <View
              style={{
                width: 200,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <ItemImage
                item={item}
                variant='Primary'
                style={{
                  width: 200,
                  aspectRatio: 2 / 3,
                  borderRadius: 12,
                }}
              />
            </View>
          </View>

          {/* Controls */}
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
            top: 20,
            right: 20,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
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

  if (!items || items.length === 0) {
    return (
      <View
        style={{
          flex: 1,
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
        height: 500, // Fixed height instead of flex: 1
        backgroundColor: "#000",
        overflow: "hidden",
      }}
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            {
              height: 500, // Fixed height instead of flex: 1
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
    </View>
  );
};
