import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { router } from "expo-router";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { runtimeTicksToSeconds } from "@/utils/time";

interface TVEpisodeItemProps {
  episode: BaseItemDto;
}

export const TVEpisodeItem = ({ episode }: TVEpisodeItemProps) => {
  const [api] = useAtom(apiAtom);
  const [isFocused, setIsFocused] = useState(false);

  const handlePress = () => {
    router.push({
      pathname: "/(auth)/player/[itemId]",
      params: { itemId: episode.Id },
    });
  };

  const imageUrl = useMemo(() => {
    if (!api || !episode.Id) return undefined;

    // Try to get episode image first
    if (episode.ImageTags?.["Primary"]) {
      return `${api.basePath}/Items/${episode.Id}/Images/Primary?tag=${episode.ImageTags["Primary"]}&quality=90&fillWidth=400`;
    }
    
    // Try parent backdrop
    if (episode.ParentBackdropItemId && episode.ParentBackdropImageTags?.[0]) {
      return `${api.basePath}/Items/${episode.ParentBackdropItemId}/Images/Backdrop?tag=${episode.ParentBackdropImageTags[0]}&quality=90&fillWidth=400`;
    }
    
    // Try series image
    if (episode.SeriesId && episode.SeriesPrimaryImageTag) {
      return `${api.basePath}/Items/${episode.SeriesId}/Images/Primary?tag=${episode.SeriesPrimaryImageTag}&quality=90&fillWidth=400`;
    }
    
    return undefined;
  }, [api, episode]);

  const progress = useMemo(() => {
    return episode.UserData?.PlayedPercentage || 0;
  }, [episode]);

  const episodeNumber = useMemo(() => {
    if (episode.IndexNumber !== undefined) {
      return `E${episode.IndexNumber}`;
    }
    return "";
  }, [episode]);

  const seasonNumber = useMemo(() => {
    if (episode.ParentIndexNumber !== undefined) {
      return `S${episode.ParentIndexNumber}`;
    }
    return "";
  }, [episode]);

  const runtime = useMemo(() => {
    return runtimeTicksToSeconds(episode.RunTimeTicks);
  }, [episode]);

  return (
    <Pressable
      style={[styles.container, isFocused && styles.containerFocused]}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onPress={handlePress}
    >
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>{episode.Name?.substring(0, 1).toUpperCase()}</Text>
          </View>
        )}
        
        {progress > 0 && (
          <>
            <View style={styles.progressBackground} />
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </>
        )}
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={1}>{episode.Name}</Text>
        
        <View style={styles.metaContainer}>
          {(seasonNumber || episodeNumber) && (
            <Text style={styles.metaText}>
              {seasonNumber}{seasonNumber && episodeNumber ? ":" : ""}{episodeNumber}
            </Text>
          )}
          
          {runtime && (
            <Text style={styles.metaText}>{runtime}</Text>
          )}
        </View>
        
        <Text style={styles.overview} numberOfLines={2}>
          {episode.Overview || ""}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  containerFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 2,
    borderColor: Colors.primary,
    transform: [{ scale: 1.02 }],
  },
  imageContainer: {
    width: 200,
    height: 120,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
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
  infoContainer: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  metaContainer: {
    flexDirection: "row",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginRight: 16,
  },
  overview: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
  },
});