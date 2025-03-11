import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { Colors } from "@/constants/Colors";
import { TVSearchInput } from "@/components/tv/TVSearchInput";

// Simple suggested searches
const SUGGESTED_SEARCHES = [
  "Action",
  "Comedy",
  "Drama",
  "Sci-Fi",
  "Animation",
  "Documentary",
];

export default function TVSearchPage() {
  const { t } = useTranslation();
  const { api, user } = useJellyfin();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BaseItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "discover">("library");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const performSearch = useCallback(
    async (query: string) => {
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
    },
    [api, user],
  );

  useEffect(() => {
    if (searchQuery && activeTab === "library") {
      const timer = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);
      return () => clearTimeout(timer);
    } else if (activeTab === "library") {
      setSearchResults([]);
    }
  }, [searchQuery, performSearch, activeTab]);

  const handleItemPress = useCallback((item: BaseItemDto) => {
    router.push({
      pathname: "/(auth)/player/[itemId]",
      params: { itemId: item.Id },
    });
  }, []);

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      setSearchQuery(suggestion);
      if (activeTab === "library") {
        performSearch(suggestion);
      }
    },
    [performSearch, activeTab],
  );

  const handleTabPress = useCallback((tab: "library" | "discover") => {
    setActiveTab(tab);
  }, []);

  const renderTabButton = (tab: "library" | "discover") => (
    <Pressable
      onPress={() => handleTabPress(tab)}
      onFocus={() => setFocusedId(`tab-${tab}`)}
      style={[
        styles.tabButton,
        activeTab === tab && styles.activeTabButton,
        focusedId === `tab-${tab}` && styles.focusedTabButton,
      ]}
    >
      <Text
        style={[
          styles.tabButtonText,
          activeTab === tab && styles.activeTabButtonText,
        ]}
      >
        {tab === "library" ? t("search.library") : t("search.discover")}
      </Text>
    </Pressable>
  );

  const renderSearchItem = ({ item }: { item: BaseItemDto }) => {
    const imageUrl = api?.getImageUrl(item.Id || "", {
      fillHeight: 300,
      fillWidth: 200,
      quality: 90,
    });

    return (
      <Pressable
        onFocus={() => setFocusedId(item.Id!)}
        onBlur={() => setFocusedId(null)}
        onPress={() => handleItemPress(item)}
        style={[
          styles.mediaItem,
          focusedId === item.Id && styles.focusedMediaItem,
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
    );
  };

  const renderSuggestion = ({
    item,
    index,
  }: {
    item: string;
    index: number;
  }) => (
    <Pressable
      onFocus={() => setFocusedId(`suggestion-${index}`)}
      onBlur={() => setFocusedId(null)}
      onPress={() => handleSuggestionPress(item)}
      style={[
        styles.suggestionItem,
        focusedId === `suggestion-${index}` && styles.focusedSuggestionItem,
      ]}
    >
      <Text style={styles.suggestionText}>{item}</Text>
    </Pressable>
  );

  const renderLibraryContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.messageText}>{t("loading")}</Text>
        </View>
      );
    } else if (searchResults.length > 0) {
      return (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsGrid}>
            {searchResults.map((item) => (
              <View key={item.Id} style={styles.mediaItemContainer}>
                {renderSearchItem({ item })}
              </View>
            ))}
          </View>
        </View>
      );
    } else if (searchQuery) {
      return (
        <View style={styles.centerContent}>
          <Text style={styles.messageText}>{t("search.no_results")}</Text>
        </View>
      );
    } else {
      return (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.sectionTitle}>{t("search.suggestions")}</Text>
          <View style={styles.suggestionsGrid}>
            {SUGGESTED_SEARCHES.map((item, index) => (
              <View
                key={`suggestion-${index}`}
                style={styles.suggestionItemContainer}
              >
                {renderSuggestion({ item, index })}
              </View>
            ))}
          </View>
        </View>
      );
    }
  };

  const renderDiscoverContent = () => {
    return (
      <View style={styles.jellyseerrContainer}>
        <Text style={styles.jellyseerrTitle}>
          {searchQuery
            ? t("search.jellyseerr_results")
            : t("search.jellyseerr_discover")}
        </Text>
        <View style={styles.jellyseerrContent}>
          <Text style={styles.jellyseerrMessage}>
            {t("search.jellyseerr_not_available_tv")}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        {renderTabButton("library")}
        {renderTabButton("discover")}
      </View>

      <View style={styles.searchInputContainer}>
        <TVSearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("search.placeholder")}
          onFocus={() => setFocusedId("search-input")}
        />
      </View>

      <View style={styles.contentContainer}>
        {activeTab === "library"
          ? renderLibraryContent()
          : renderDiscoverContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    padding: 40,
  },
  tabsContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginRight: 16,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
  },
  activeTabButton: {
    backgroundColor: Colors.primary,
  },
  focusedTabButton: {
    borderWidth: 2,
    borderColor: "white",
    transform: [{ scale: 1.05 }],
  },
  tabButtonText: {
    color: "white",
    fontSize: 18,
  },
  activeTabButtonText: {
    fontWeight: "bold",
  },
  searchInputContainer: {
    marginBottom: 30,
  },
  contentContainer: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messageText: {
    color: "white",
    fontSize: 20,
  },
  suggestionsContainer: {
    flex: 1,
  },
  sectionTitle: {
    color: "white",
    fontSize: 24,
    marginBottom: 20,
  },
  suggestionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
  },
  suggestionItemContainer: {
    width: "33.33%",
    padding: 10,
  },
  suggestionItem: {
    flex: 1,
    padding: 20,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  focusedSuggestionItem: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.05 }],
  },
  suggestionText: {
    color: "white",
    fontSize: 18,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 10,
  },
  mediaItemContainer: {
    width: "20%",
    padding: 10,
  },
  mediaItem: {
    borderRadius: 8,
  },
  focusedMediaItem: {
    transform: [{ scale: 1.05 }],
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  mediaImage: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 8,
  },
  mediaTitle: {
    color: "white",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
  jellyseerrContainer: {
    flex: 1,
    padding: 20,
  },
  jellyseerrTitle: {
    color: "white",
    fontSize: 24,
    marginBottom: 20,
  },
  jellyseerrContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  jellyseerrMessage: {
    color: "white",
    fontSize: 18,
    textAlign: "center",
  },
});
