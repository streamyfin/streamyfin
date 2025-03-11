import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { Colors } from "@/constants/Colors";

interface TVMediaItemProps {
  item: BaseItemDto;
}

export const TVMediaItem = ({ item }: TVMediaItemProps) => {
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
    }
  };

  const imageUrl = api?.getImageUrl(item.Id || "", {
    fillHeight: 300,
    fillWidth: 200,
    quality: 90,
  });

  return (
    <View style={styles.container}>
      <Pressable
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPress={handlePress}
        style={[styles.pressable, isFocused && styles.focused]}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
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
    width: 160,
  },
  pressable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  focused: {
    transform: [{ scale: 1.05 }],
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  image: {
    width: "100%",
    aspectRatio: 2/3,
    borderRadius: 8,
  },
  title: {
    marginTop: 8,
    fontSize: 14,
    color: "white",
    textAlign: "center",
  },
});