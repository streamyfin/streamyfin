import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TVFocusGuideView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Image } from "expo-image";
import { router } from "expo-router";
import { apiAtom } from "@/providers/JellyfinProvider";
import { WatchedIndicator } from "../WatchedIndicator";
import { useAtom } from "jotai";

interface TVScrollingCollectionListProps {
  queryFn: () => Promise<BaseItemDto[]>;
  queryKey: string[];
  title: string;
  hideIfEmpty?: boolean;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
}

export const TVScrollingCollectionList = ({
  queryFn,
  queryKey,
  title,
  hideIfEmpty = false,
  orientation = "horizontal",
  disabled = false,
}: TVScrollingCollectionListProps) => {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const [isFocused, setIsFocused] = useState<{ [key: string]: boolean }>({});
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const handleItemPress = useCallback((item: BaseItemDto) => {
    // For TV app, we need to use different navigation paths
    if (item.Type === "Series") {
      // Check if the series path exists, otherwise use home as fallback
      router.push({
        pathname: "/(auth)/(tabs)/(home)/series/[seriesId]",
        params: { seriesId: item.Id },
      });
    } else if (item.Type === "Movie" || item.Type === "Video") {
      router.push({
        pathname: "/(auth)/player/[itemId]",
        params: { itemId: item.Id },
      });
    } else if (item.Type === "Episode") {
      router.push({
        pathname: "/(auth)/player/[itemId]",
        params: { itemId: item.Id },
      });
    } else if (item.Type === "BoxSet") {
      router.push({
        pathname: "/(auth)/(tabs)/(home)/collections/[boxsetId]",
        params: { boxsetId: item.Id },
      });
    } else if (item.Type === "Playlist") {
      router.push({
        pathname: "/(auth)/(tabs)/(libraries)/[playlistId]",
        params: { playlistId: item.Id },
      });
    }
  }, []);

  const handleItemFocus = useCallback((id: string) => {
    setIsFocused((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleItemBlur = useCallback((id: string) => {
    setIsFocused((prev) => ({ ...prev, [id]: false }));
  }, []);

  const getImageUrl = useCallback(
    (item: BaseItemDto) => {
      if (!api || !item.Id) {
        console.log(`Missing API or item ID for ${item.Name}`);
        return undefined;
      }

      try {
        // For episodes in horizontal orientation
        if (item.Type === "Episode" && orientation === "horizontal") {
          // Try parent backdrop first
          if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]) {
            return `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Backdrop?tag=${item.ParentBackdropImageTags[0]}&fillHeight=389&quality=90`;
          }
          // Try series thumb
          if (item.SeriesId && item.SeriesThumbImageTag) {
            return `${api.basePath}/Items/${item.SeriesId}/Images/Thumb?tag=${item.SeriesThumbImageTag}&fillHeight=389&quality=90`;
          }
        }

        // For episodes in vertical orientation or if no parent images available
        if (item.Type === "Episode") {
          // Try series primary image
          if (item.SeriesId && item.SeriesPrimaryImageTag) {
            return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?tag=${item.SeriesPrimaryImageTag}&fillHeight=389&quality=90`;
          }
        }

        // For horizontal orientation of other types, try thumb image first
        if (orientation === "horizontal") {
          if (item.ImageTags?.["Thumb"]) {
            return `${api.basePath}/Items/${item.Id}/Images/Thumb?tag=${item.ImageTags["Thumb"]}&fillHeight=389&quality=90`;
          }
          // Try backdrop if available
          if (item.BackdropImageTags?.[0]) {
            return `${api.basePath}/Items/${item.Id}/Images/Backdrop?tag=${item.BackdropImageTags[0]}&fillHeight=389&quality=90`;
          }
        }

        // Default to primary image if available
        if (item.ImageTags?.["Primary"]) {
          return `${api.basePath}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags["Primary"]}&fillHeight=${orientation === "horizontal" ? 389 : 300}&fillWidth=${orientation === "horizontal" ? 600 : 200}&quality=90`;
        }

        // Fallback to parent primary image for episodes
        if (
          item.Type === "Episode" &&
          item.SeriesId &&
          item.SeriesPrimaryImageTag
        ) {
          return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?tag=${item.SeriesPrimaryImageTag}&fillHeight=${orientation === "horizontal" ? 389 : 300}&fillWidth=${orientation === "horizontal" ? 600 : 200}&quality=90`;
        }

        console.log(`No suitable image found for ${item.Name} (${item.Type})`);
        return undefined;
      } catch (error) {
        console.error(`Error generating image URL for ${item.Name}:`, error);
        return undefined;
      }
    },
    [api, orientation],
  );

  const renderMediaItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      const imageUrl = getImageUrl(item);
      const progress = item.UserData?.PlayedPercentage || 0;

      // Log image URL for debugging
      console.log(`Item ${item.Name} (${item.Type}) image URL:`, imageUrl);

      return (
        <TVFocusGuideView style={styles.mediaItemContainer}>
          <Pressable
            onFocus={() => handleItemFocus(item.Id!)}
            onBlur={() => handleItemBlur(item.Id!)}
            onPress={() => handleItemPress(item)}
            style={[
              styles.mediaItem,
              orientation === "horizontal"
                ? styles.mediaItemHorizontal
                : styles.mediaItemVertical,
              isFocused[item.Id!] && styles.focusedItem,
            ]}
          >
            <View style={styles.imageContainer}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={[
                    styles.mediaImage,
                    orientation === "horizontal"
                      ? styles.mediaImageHorizontal
                      : styles.mediaImageVertical,
                  ]}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[
                    styles.placeholderImage,
                    orientation === "horizontal"
                      ? styles.mediaImageHorizontal
                      : styles.mediaImageVertical,
                  ]}
                >
                  <Text style={styles.placeholderText}>
                    {item.Name?.substring(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}

              {!progress && <WatchedIndicator item={item} />}

              {progress > 0 && (
                <>
                  <View style={styles.progressBackground} />
                  <View
                    style={[styles.progressBar, { width: `${progress}%` }]}
                  />
                </>
              )}
            </View>

            <Text style={styles.mediaTitle} numberOfLines={1}>
              {item.Name}
            </Text>
          </Pressable>
        </TVFocusGuideView>
      );
    },
    [
      getImageUrl,
      handleItemFocus,
      handleItemBlur,
      handleItemPress,
      isFocused,
      orientation,
    ],
  );

  if (disabled) return null;
  if (hideIfEmpty === true && data?.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable
        style={[
          styles.titleContainer,
          isTitleFocused && styles.titleContainerFocused,
        ]}
        onFocus={() => setIsTitleFocused(true)}
        onBlur={() => setIsTitleFocused(false)}
      >
        <Text style={[styles.title, isTitleFocused && styles.titleFocused]}>
          {title}
          {isTitleFocused && (
            <Ionicons
              name="chevron-forward"
              size={24}
              color={Colors.primary}
              style={styles.titleIcon}
            />
          )}
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
        </View>
      ) : !data || data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("home.no_items")}</Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={data}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.Id!}
          contentContainerStyle={styles.horizontalList}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  titleContainer: {
    marginBottom: 16,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  titleContainerFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    paddingVertical: 8,
  },
  titleFocused: {
    color: Colors.primary,
  },
  titleIcon: {
    marginLeft: 8,
  },
  horizontalList: {
    paddingLeft: 40,
    paddingRight: 20,
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  loadingText: {
    color: "white",
    fontSize: 16,
  },
  emptyContainer: {
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 16,
  },
  mediaItemContainer: {
    marginRight: 20,
  },
  mediaItem: {
    borderRadius: 8,
    overflow: "hidden",
  },
  mediaItemVertical: {
    width: 160,
  },
  mediaItemHorizontal: {
    width: 240,
  },
  imageContainer: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  mediaImage: {
    width: "100%",
  },
  mediaImageVertical: {
    aspectRatio: 2 / 3,
  },
  mediaImageHorizontal: {
    aspectRatio: 16 / 9,
  },
  placeholderImage: {
    width: "100%",
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "white",
    fontSize: 40,
    fontWeight: "bold",
  },
  focusedItem: {
    transform: [{ scale: 1.1 }],
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  mediaTitle: {
    color: "white",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
  progressBackground: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  progressBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 4,
    backgroundColor: Colors.primary,
  },
});
