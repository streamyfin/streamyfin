import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TVFocusGuideView } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { Colors } from "@/constants/Colors";
import { TVSearchInput } from "@/components/tv/TVSearchInput";

export default function TVSearchPage() {
  const { t } = useTranslation();
  const { api, user } = useJellyfin();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState<{[key: string]: boolean}>({});

  const performSearch = useCallback(async (query: string) => {
    if (!api || !user || !query) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await getSearchApi(api).get({
        userId: user.Id!,
        searchTerm: query,
        includeItemTypes: ["Movie", "Series", "Episode"],
        limit: 50,
        recursive: true,
        fields: ["Overview", "PrimaryImageAspectRatio"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      });
      setSearchResults(response.data.SearchHints || []);
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => {
    if (searchQuery) {
      const timer = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, performSearch]);

  const handleItemPress = useCallback((item: BaseItemDto) => {
    router.push({
      pathname: "/(auth)/player/[itemId]",
      params: { itemId: item.Id },
    });
  }, []);

  const handleItemFocus = useCallback((id: string) => {
    setIsFocused(prev => ({...prev, [id]: true}));
  }, []);

  const handleItemBlur = useCallback((id: string) => {
    setIsFocused(prev => ({...prev, [id]: false}));
  }, []);

  const renderSearchItem = ({ item }: { item: BaseItemDto }) => {
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
      <View style={styles.searchContainer}>
        <TVSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("search_placeholder")}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      ) : searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchItem}
          keyExtractor={(item) => item.Id!}
          numColumns={5}
          contentContainerStyle={styles.resultsGrid}
        />
      ) : searchQuery ? (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>{t("no_results_found")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 40,
  },
  searchContainer: {
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
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noResultsText: {
    color: "white",
    fontSize: 20,
  },
  resultsGrid: {
    paddingVertical: 20,
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