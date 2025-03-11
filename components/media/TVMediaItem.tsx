import React, { useState, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { Colors } from "@/constants/Colors";
import { WatchedIndicator } from "../WatchedIndicator";

interface TVMediaItemProps {
  item: BaseItemDto;
  orientation?: "horizontal" | "vertical";
  onFocus?: () => void;
  onBlur?: () => void;
}

export const TVMediaItem = ({ 
  item, 
  orientation = "vertical",
  onFocus,
  onBlur
}: TVMediaItemProps) => {
  const { api } = useJellyfin();
  const [isFocused, setIsFocused] = useState(false);

  const handlePress = () => {
    if (item.Type === "Series") {
      router.push({
        pathname: "/(auth)/(tv)/series/[seriesId]",
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
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (onBlur) onBlur();
  };

  const imageUrl = useMemo(() => {
    if (item.Type === "Episode") {
      if (orientation === "horizontal") {
        if (item.ParentBackdropItemId && item.ParentThumbImageTag) {
          return api?.getImageUrl(item.ParentBackdropItemId, {
            tag: item.ParentThumbImageTag,
            fillHeight: 389,
            quality: 90,
          });
        }
      } else {
        return api?.getImageUrl(item.SeriesId || "", {
          tag: item.SeriesPrimaryImageTag,
          fillHeight: 389,
          quality: 90,
        });
      }
    }

    // For horizontal orientation, try to use thumb image first
    if (orientation === "horizontal" && item.ImageTags?.["Thumb"]) {
      return api?.getImageUrl(item.Id || "", {
        tag: item.ImageTags["Thumb"],
        fillHeight: 389,
        quality: 90,
        imageType: "Thumb"
      });
    }

    // Default to primary image
    return api?.getImageUrl(item.Id || "", {
      fillHeight: orientation === "horizontal" ? 389 : 300,
      fillWidth: orientation === "horizontal" ? 600 : 200,
      quality: 90,
      imageType: "Primary"
    });
  }, [item, orientation]);

  const progress = useMemo(() => {
    if (item.Type === "Program") {
      const startDate = new Date(item.StartDate || "");
      const endDate = new Date(item.EndDate || "");
      const now = new Date();
      const total = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      return (elapsed / total) * 100;
    } else {
      return item.UserData?.PlayedPercentage || 0;
    }
  }, [item]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.["Primary"] as string;
    return item.ImageBlurHashes?.["Primary"]?.[key];
  }, [item]);

  return (
    <View style={[
      styles.container,
      orientation === "horizontal" ? styles.containerHorizontal : styles.containerVertical
    ]}>
      <Pressable
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPress={handlePress}
        style={[
          styles.pressable,
          isFocused && styles.focused,
          orientation === "horizontal" ? styles.pressableHorizontal : styles.pressableVertical
        ]}
      >
        <View style={[
          styles.imageContainer,
          orientation === "horizontal" ? styles.imageContainerHorizontal : styles.imageContainerVertical
        ]}>
          <Image
            source={{ uri: imageUrl }}
            placeholder={{ blurhash }}
            style={[
              styles.image,
              orientation === "horizontal" ? styles.imageHorizontal : styles.imageVertical
            ]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {!progress && <WatchedIndicator item={item} />}
          {progress > 0 && (
            <>
              <View style={styles.progressBackground} />
              <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {item.Name}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 8,
  },
  containerVertical: {
    width: 160,
  },
  containerHorizontal: {
    width: 240,
  },
  pressable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  pressableVertical: {
    aspectRatio: 2/3,
  },
  pressableHorizontal: {
    aspectRatio: 16/9,
  },
  focused: {
    transform: [{ scale: 1.05 }],
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  imageContainer: {
    position: 'relative',
    width: "100%",
    overflow: "hidden",
    borderRadius: 8,
  },
  imageContainerVertical: {
    aspectRatio: 2/3,
  },
  imageContainerHorizontal: {
    aspectRatio: 16/9,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageVertical: {
    aspectRatio: 2/3,
  },
  imageHorizontal: {
    aspectRatio: 16/9,
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    color: "white",
    textAlign: "center",
  },
  progressBackground: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 4,
    backgroundColor: Colors.primary,
  },
});