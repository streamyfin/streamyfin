import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TVFocusGuideView } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { getFavoritesApi } from "@jellyfin/sdk/lib/utils/api/user-library-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { Colors } from "@/constants/Colors";

export default function TVFavoritesPage() {
  const { t } = useTranslation();
  const { api, user } = useJellyfin();
  const [favorites, setFavorites] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFocused, setIsFocused] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (!api || !user) return;

    const fetchFavorites = async () => {
      setLoading(true);
      try {
        const response = await getFavoritesApi(api).getFavoriteItems({
          userId: user.Id!,
          fields: ["Overview", "PrimaryImageAspectRatio"],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        });
        setFavorites(response.data.Items || []);
      } catch (error) {
        console.error("Failed to fetch favorites:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [api, user]);

  const handleItemPress = useCallback((item: BaseItemDto) => {
    if (item.Type === "Series") {
      router.push({
        pathname: "/(auth)/(tv)/series/[seriesId]",
        params: { seriesId: item.Id },
      });
    } else {
      router.push({
        pathname: "/(auth)/player/[itemId]",
        params: { itemId: item.Id },
      });
    }
  }, []);

  const handleItemFocus = useCallback((id: string) => {
    setIsFocused(prev => ({...prev, [id]: true}));
  }, []);

  const handleItemBlur = useCallback((id: string) => {
    setIsFocused(prev => ({...prev, [id]: false}));
  }, []);

  const renderFavoriteItem = ({ item }: { item: BaseItemDto }) => {
    const imageUrl = api?.getImageUrl(item.Id || "", { 
      fillHeight: 300, 
      fillWidth: 200, 
      quality: 90 
    });

    return (
      <TVFocusGuideView style={styles.mediaItemContainer}>
        <Pressable
          onFocus={() => handleItemFocus(item.Id!)}
          onBlur={() => handleItemBlur(item.Id!)}
          onPress={() => handleItemPress(item)}
          style={[
            styles.mediaItem,
            isFocused[item.Id!] && styles.focusedItem
          ]}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.mediaImage}
            contentFit="cover"
          />
          <Text style={styles.mediaTitle} numberOfLines={1}>
            {item.Name}
          </Text>
        </Pressable>
      </TVFocusGuideView>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>{t("tabs.favorites")}</Text>
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      ) : favorites.length > 0 ? (
        <FlatList
          data={favorites}
          renderItem={renderFavoriteItem}
          keyExtractor={(item) => item.Id!}
          numColumns={5}
          contentContainerStyle={styles.favoritesGrid}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("no_favorites")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 40,
  },
  pageTitle: {
    color: "white",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "white",
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "white",
    fontSize: 20,
  },
  favoritesGrid: {
    paddingVertical: 10,
  },
  mediaItemContainer: {
    width: "20%",
    padding: 10,
  },
  mediaItem: {
    borderRadius: 8,
    overflow: "hidden",
  },
  focusedItem: {
    transform: [{ scale: 1.1 }],
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  mediaImage: {
    width: "100%",
    aspectRatio: 2/3,
    borderRadius: 8,
  },
  mediaTitle: {
    color: "white",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
});