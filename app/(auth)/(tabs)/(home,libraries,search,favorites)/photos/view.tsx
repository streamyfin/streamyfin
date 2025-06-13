import { Text } from "@/components/common/Text";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getPhotoImageUrl } from "@/utils/jellyfin/image/getPhotoImageUrl";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Dimensions, StyleSheet, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  TouchableOpacity,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PhotoViewPage: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { id } = useLocalSearchParams() as { id: string };
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const windowDimensions = Dimensions.get("window");

  // Animated values for gestures
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const positionX = useSharedValue(0);
  const positionY = useSharedValue(0);
  const savedPositionX = useSharedValue(0);
  const savedPositionY = useSharedValue(0);
  const uiVisible = useSharedValue(true);
  const imageOpacity = useSharedValue(1); // For image transition effects

  // Fetch image data
  const {
    data: item,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["photo-item", id],
    queryFn: async () => {
      if (!api || !user || !id) return null;
      const res = await getUserLibraryApi(api).getItem({
        itemId: id,
        userId: user?.Id,
      });
      return res.data;
    },
    enabled: !!api && !!user && !!id,
  });

  // Set navigation title
  useEffect(() => {
    if (item) {
      navigation.setOptions({
        title: item.Name || t("photo.view"),
      });
    }
  }, [navigation, item]);

  // Generate image URL if we have an item
  // Use the updated getPhotoImageUrl function to get a direct URL
  const imageUrl =
    item && api
      ? getPhotoImageUrl({
          api,
          item,
          // For original photos, we're now using the download endpoint
          // which doesn't use these parameters, but keeping them for fallback
          quality: 100,
          height: Math.max(windowDimensions.height * 2, 1200),
          width: Math.max(windowDimensions.width * 2, 1200),
        })
      : null;

  // Set the background color to black
  useEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: {
        backgroundColor: "rgba(0,0,0,0.5)",
      },
      headerTintColor: "#fff",
    });
  }, [navigation]);

  // Function to toggle UI visibility
  const toggleUI = () => {
    uiVisible.value = !uiVisible.value;
  };
  // Function to navigate to the next or previous item
  const navigateToSibling = async (direction: "next" | "previous") => {
    if (!item || !item.ParentId || !api || !user) return;

    try {
      // Get all items in the same folder using the getItemsApi instead
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        parentId: item.ParentId,
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        includeItemTypes: ["Photo"],
      });

      if (!response.data.Items || response.data.Items.length <= 1) return;

      // Find the current item's index
      const currentIndex = response.data.Items.findIndex(
        (i: BaseItemDto) => i.Id === item.Id,
      );
      if (currentIndex === -1) return;

      let nextIndex = 0;
      if (direction === "next") {
        nextIndex = (currentIndex + 1) % response.data.Items.length;
      } else {
        nextIndex =
          (currentIndex - 1 + response.data.Items.length) %
          response.data.Items.length;
      }

      const nextItem = response.data.Items[nextIndex];

      // Create a wrapper function to handle navigation
      const handleNavigation = () => {
        navigation.setParams({ id: nextItem.Id } as any);
      };

      // Create a wrapper for the delayed opacity reset
      const resetOpacity = () => {
        setTimeout(() => {
          const updateOpacity = () => {
            "worklet";
            imageOpacity.value = withTiming(1, { duration: 300 });
          };
          updateOpacity();
        }, 50);
      };

      // Start image transition effect
      imageOpacity.value = withTiming(0, { duration: 150 }, (finished) => {
        "worklet";
        if (finished) {
          // Use runOnJS for non-worklet functions
          runOnJS(handleNavigation)();

          // Reset zoom and position when navigating to next/previous photo
          scale.value = 1;
          savedScale.value = 1;
          positionX.value = 0;
          positionY.value = 0;
          savedPositionX.value = 0;
          savedPositionY.value = 0;

          // Use runOnJS for setTimeout
          runOnJS(resetOpacity)();
        }
      });
    } catch (error) {
      console.error("Error navigating between photos:", error);
    }
  };

  // Setup gestures
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // If zoomed in, allow panning the image
      if (scale.value > 1) {
        positionX.value = savedPositionX.value + e.translationX;
        positionY.value = savedPositionY.value + e.translationY;
        return;
      }

      // If not zoomed in and swiping horizontally, we'll use it for navigation
      if (
        Math.abs(e.translationX) > Math.abs(e.translationY) &&
        Math.abs(e.translationX) > 50
      ) {
        positionX.value = savedPositionX.value + e.translationX * 0.3; // Apply resistance to the swipe
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        // If zoomed in, just save the position
        savedPositionX.value = positionX.value;
        savedPositionY.value = positionY.value;
      } else {
        // If not zoomed and swiped far enough horizontally, navigate
        if (Math.abs(e.translationX) > 100) {
          const direction = e.translationX > 0 ? "previous" : "next";
          runOnJS(navigateToSibling)(direction);
        }

        // Reset position with animation
        positionX.value = withTiming(0);
        savedPositionX.value = 0;
      }
    });

  const tapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(toggleUI)();
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        // Reset to normal scale
        scale.value = withTiming(1);
        positionX.value = withTiming(0);
        positionY.value = withTiming(0);
        savedScale.value = 1;
        savedPositionX.value = 0;
        savedPositionY.value = 0;
      } else {
        // Zoom in - centered on the tap location
        const targetScale = 2.5;
        // Calculate the position adjustment to center on tap point
        const windowWidth = windowDimensions.width;
        const windowHeight = windowDimensions.height;

        // Convert to center coordinates (where 0,0 is the center of the screen)
        const centerX = e.x - windowWidth / 2;
        const centerY = e.y - windowHeight / 2;

        // Apply scaling to position so the tap point becomes the center
        const targetX = -centerX * (targetScale - 1);
        const targetY = -centerY * (targetScale - 1);

        // Animate to the zoomed state
        scale.value = withTiming(targetScale);
        positionX.value = withTiming(targetX);
        positionY.value = withTiming(targetY);

        // Save these values
        savedScale.value = targetScale;
        savedPositionX.value = targetX;
        savedPositionY.value = targetY;
      }
    });

  const composed = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, tapGesture),
  );

  // Animated styles
  const imageAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: imageOpacity.value,
      transform: [
        { translateX: positionX.value },
        { translateY: positionY.value },
        { scale: scale.value },
      ],
    };
  });

  const infoContainerStyle = useAnimatedStyle(() => {
    return {
      opacity: uiVisible.value ? 1 : 0,
      transform: [{ translateY: uiVisible.value ? 0 : 100 }],
    };
  });

  const closeButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: uiVisible.value ? 1 : 0,
    };
  });

  const navigationControlsStyle = useAnimatedStyle(() => {
    return {
      // Hide navigation controls when zoomed in or UI is hidden
      opacity: scale.value > 1 || !uiVisible.value ? 0 : 1,
      // Make navigation controls non-interactive when hidden
      pointerEvents: scale.value > 1 || !uiVisible.value ? "none" : "auto",
    };
  });

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <ActivityIndicator size='large' color='#fff' />
      </View>
    );
  }

  if (isError || !item) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.errorText}>{t("common.error.loading")}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <GestureDetector gesture={composed}>
        <Animated.View style={styles.imageContainer}>
          {imageUrl ? (
            <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                contentFit='contain'
                contentPosition='center'
                transition={300}
                onLoad={() => console.log("Image loaded successfully")}
                onError={(error) => console.log("Image loading error:", error)}
                cachePolicy='none' // Important - don't cache to ensure fresh load
                recyclingKey={id} // Use id to force reload when image changes
              />
            </Animated.View>
          ) : (
            <Text style={styles.errorText}>{t("photo.notFound")}</Text>
          )}
        </Animated.View>
      </GestureDetector>

      <Animated.View style={[styles.infoContainer, infoContainerStyle]}>
        <Text style={styles.title}>{item.Name}</Text>

        {item.PremiereDate && (
          <Text style={styles.date}>
            {new Date(item.PremiereDate).toLocaleDateString()}
          </Text>
        )}

        {/* Display image metadata if available */}
        {item.Width && item.Height && (
          <Text style={styles.metadata}>
            {item.Width} × {item.Height}
          </Text>
        )}
      </Animated.View>

      {/* Navigation Controls - with proper shared value handling */}
      <Animated.View
        style={[styles.navigationControls, navigationControlsStyle]}
      >
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateToSibling("previous")}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name='chevron-back' size={24} color='white' />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigateToSibling("next")}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name='chevron-forward' size={24} color='white' />
        </TouchableOpacity>
      </Animated.View>

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Animated.View style={closeButtonStyle}>
          <Ionicons name='close' size={20} color='white' />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000", // Ensure black background
  },
  imageWrapper: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%", // Use full height
    backgroundColor: "transparent",
    // Adding more specific styles to ensure image visibility
    resizeMode: "contain",
  },
  infoContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  navigationControls: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "transparent",
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    // Add a subtle shadow to make the button more visible against various backgrounds
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  date: {
    color: "white",
    fontSize: 14,
    marginTop: 4,
  },
  metadata: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    color: "white",
    fontSize: 16,
  },
  closeButton: {
    position: "absolute",
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
    // Add a subtle shadow to match navigation buttons
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});

export default PhotoViewPage;
