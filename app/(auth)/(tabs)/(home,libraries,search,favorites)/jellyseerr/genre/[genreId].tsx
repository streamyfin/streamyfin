import React, { useState, useEffect } from "react";
import { View, StyleSheet, Platform, Pressable, FlatList } from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useJellyseerr, Endpoints } from "@/hooks/useJellyseerr";
import { useQuery } from "@tanstack/react-query";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GenrePage: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { genreId, type, name } = params as { genreId: string; type: string; name: string };
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const { jellyseerrApi } = useJellyseerr();
  const insets = useSafeAreaInsets();

  const handleBackPress = () => {
    navigation.goBack();
  };

  // Use trending as a base for popular content
  const { data, isLoading } = useQuery({
    queryKey: ["jellyseerr", "genre", type, genreId],
    queryFn: async () => {
      // Use trending endpoint as base data source
      const endpoint = type.includes("MOVIE") 
        ? Endpoints.DISCOVER_TRENDING + "/movies" 
        : Endpoints.DISCOVER_TRENDING + "/tv";
      
      const trendingResults = await jellyseerrApi?.discover(endpoint, {
        page: 1,
        language: "en"
      });
      
      // Also get popular content
      const popularEndpoint = type.includes("MOVIE") 
        ? Endpoints.DISCOVER_MOVIES
        : Endpoints.DISCOVER_TV;
        
      const popularResults = await jellyseerrApi?.discover(popularEndpoint, {
        page: 1,
        language: "en"
      });
      
      // Combine results
      const combinedResults = [
        ...(trendingResults?.results || []),
        ...(popularResults?.results || [])
      ];
      
      // Filter by genre ID and remove duplicates
      const uniqueIds = new Set();
      const filteredResults = combinedResults.filter(item => {
        if (
          item.genreIds && 
          item.genreIds.includes(parseInt(genreId)) &&
          !uniqueIds.has(item.id)
        ) {
          uniqueIds.add(item.id);
          return true;
        }
        return false;
      });
      
      return {
        results: filteredResults,
        totalResults: filteredResults.length
      };
    },
    enabled: !!jellyseerrApi && !!genreId,
  });

  useEffect(() => {
    navigation.setOptions({
      title: name || t("jellyseerr.genre_details"),
    });
  }, [name]);

  const ListHeaderComponent = () => (
    <View style={styles.header}>
      <Text style={styles.title}>{name || t("jellyseerr.genre_details")}</Text>
      <Text style={styles.subtitle}>
        {data?.totalResults 
          ? t("search.x_items", { count: data.totalResults }) 
          : isLoading 
            ? t("library.options.loading") 
            : t("library.no_items_found")}
      </Text>
    </View>
  );

  const ListEmptyComponent = () => (
    isLoading ? (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
      </View>
    ) : (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#888" />
        <Text style={styles.emptyText}>{t("library.no_items_found")}</Text>
      </View>
    )
  );

  const renderItem = ({ item }) => (
    <View 
      style={[
        styles.posterContainer,
        Platform.isTV && focusedItem === item.id.toString() && styles.focusedItem
      ]}
    >
      <JellyseerrPoster 
        item={item} 
        key={item.id}
        onFocus={() => Platform.isTV && setFocusedItem(item.id.toString())}
        onBlur={() => Platform.isTV && setFocusedItem(null)}
      />
    </View>
  );

  return (
    <View 
      style={[
        styles.container,
        {
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }
      ]}
    >
      <FlatList
        data={data?.results || []}
        keyExtractor={(item) => item.id.toString()}
        numColumns={Platform.isTV ? 4 : 3}
        contentContainerStyle={[
          styles.gridContainer,
          (!data?.results || data.results.length === 0) && styles.emptyGridContainer
        ]}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        renderItem={renderItem}
      />

      {Platform.isTV && (
        <Pressable
          style={[
            styles.backButton,
            focusedButton === 'back' && styles.focusedButton
          ]}
          onFocus={() => setFocusedButton('back')}
          onBlur={() => setFocusedButton(null)}
          onPress={handleBackPress}
        >
          <Ionicons name="arrow-back" size={24} color="white" style={styles.backIcon} />
          <Text style={styles.backButtonText}>{t("home.downloads.back")}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  gridContainer: {
    padding: Platform.isTV ? 40 : 16,
    paddingBottom: Platform.isTV ? 100 : 20, // Extra space for TV back button
  },
  emptyGridContainer: {
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
  },
  posterContainer: {
    margin: 8,
  },
  focusedItem: {
    transform: [{ scale: 1.05 }],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 18,
    color: "white",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: "#888",
    marginTop: 16,
  },
  backButton: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  focusedButton: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.05 }],
    borderWidth: 2,
    borderColor: "white",
  },
  backIcon: {
    marginRight: 10,
  },
  backButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  }
});

export default GenrePage;