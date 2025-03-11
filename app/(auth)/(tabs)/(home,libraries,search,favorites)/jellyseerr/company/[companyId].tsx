import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Platform,
  Pressable,
  FlatList,
  Image,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useJellyseerr, Endpoints } from "@/hooks/useJellyseerr";
import { useQuery } from "@tanstack/react-query";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CompanyPage: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { companyId } = params as { companyId: string };
  const [focusedButton, setFocusedButton] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const { jellyseerrApi } = useJellyseerr();
  const insets = useSafeAreaInsets();

  const handleBackPress = () => {
    navigation.goBack();
  };

  // Use the discover endpoint for studios
  const { data: moviesData, isLoading: isMoviesLoading } = useQuery({
    queryKey: ["jellyseerr", "company", companyId],
    queryFn: async () => {
      // Try the studio-specific endpoint first
      try {
        const studioEndpoint = `${Endpoints.DISCOVER_MOVIES_STUDIO}/${companyId}`;
        const studioResults = await jellyseerrApi?.discover(studioEndpoint, {
          page: 1,
          language: "en",
        });

        if (
          studioResults &&
          studioResults.results &&
          studioResults.results.length > 0
        ) {
          return studioResults;
        }
      } catch (error) {
        console.log("Studio endpoint failed, trying alternative approach");
      }

      // If that fails, try to get trending and popular movies and filter them
      const trendingResults = await jellyseerrApi?.discover(
        Endpoints.DISCOVER_TRENDING + "/movies",
        {
          page: 1,
          language: "en",
        },
      );

      const popularResults = await jellyseerrApi?.discover(
        Endpoints.DISCOVER_MOVIES,
        {
          page: 1,
          language: "en",
        },
      );

      // Combine results
      const combinedResults = [
        ...(trendingResults?.results || []),
        ...(popularResults?.results || []),
      ];

      // Get details for each movie to check production companies
      const detailedResults = await Promise.all(
        combinedResults
          .slice(0, 20) // Limit to 20 for performance
          .map(async (item) => {
            try {
              return await jellyseerrApi?.movieDetails(item.id);
            } catch (error) {
              console.error(
                `Error fetching details for movie ${item.id}:`,
                error,
              );
              return null;
            }
          }),
      );

      // Filter results by production company ID
      const uniqueIds = new Set();
      const filteredResults = detailedResults
        .filter(
          (item) =>
            item &&
            item.productionCompanies &&
            item.productionCompanies.some(
              (company) => company.id.toString() === companyId,
            ) &&
            !uniqueIds.has(item.id),
        )
        .map((item) => {
          uniqueIds.add(item.id);
          return item;
        });

      return {
        results: filteredResults.filter(Boolean),
        totalResults: filteredResults.length,
      };
    },
    enabled: !!jellyseerrApi && !!companyId,
  });

  useEffect(() => {
    if (moviesData?.results?.[0]?.productionCompanies) {
      const company = moviesData.results[0].productionCompanies.find(
        (c) => c.id.toString() === companyId,
      );
      if (company) {
        navigation.setOptions({
          title: company.name,
        });
      }
    }
  }, [moviesData]);

  // Find company details from the first movie result
  const company = moviesData?.results?.[0]?.productionCompanies?.find(
    (c) => c.id.toString() === companyId,
  );

  const ListHeaderComponent = () => (
    <>
      {company && (
        <View style={styles.companyInfoContainer}>
          <View style={styles.logoContainer}>
            {company.logoPath ? (
              <Image
                source={{
                  uri: jellyseerrApi?.imageProxy(company.logoPath, "w500"),
                }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.noLogo}>
                <Ionicons name="business" size={64} color="#888" />
              </View>
            )}
          </View>

          <View style={styles.detailsContainer}>
            <Text style={styles.name}>{company.name}</Text>

            {company.originCountry && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {t("jellyseerr.production_country")}:
                </Text>
                <Text style={styles.infoValue}>{company.originCountry}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("jellyseerr.productions")}</Text>
        <Text style={styles.subtitle}>
          {moviesData?.totalResults
            ? t("search.x_items", { count: moviesData.totalResults })
            : isMoviesLoading
              ? t("library.options.loading")
              : t("library.no_items_found")}
        </Text>
      </View>
    </>
  );

  const ListEmptyComponent = () =>
    isMoviesLoading ? (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
      </View>
    ) : (
      <View style={styles.emptyContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#888" />
        <Text style={styles.emptyText}>{t("library.no_items_found")}</Text>
      </View>
    );

  const renderItem = ({ item }) => (
    <View
      style={[
        styles.movieItem,
        Platform.isTV &&
          focusedItem === item.id.toString() &&
          styles.focusedItem,
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
        },
      ]}
    >
      <FlatList
        data={moviesData?.results || []}
        keyExtractor={(item) => item.id.toString()}
        horizontal={!Platform.isTV}
        numColumns={Platform.isTV ? 4 : undefined}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          Platform.isTV ? styles.tvGridContainer : styles.gridContainer,
          (!moviesData?.results || moviesData.results.length === 0) &&
            styles.emptyGridContainer,
        ]}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        renderItem={renderItem}
      />

      {Platform.isTV && (
        <Pressable
          style={[
            styles.backButton,
            focusedButton === "back" && styles.focusedButton,
          ]}
          onFocus={() => setFocusedButton("back")}
          onBlur={() => setFocusedButton(null)}
          onPress={handleBackPress}
          hasTVPreferredFocus={true}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="white"
            style={styles.backIcon}
          />
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
    padding: 16,
    paddingRight: 0, // Since items have right margin
  },
  tvGridContainer: {
    padding: 40,
    paddingBottom: 100, // Extra space for the back button
  },
  emptyGridContainer: {
    flexGrow: 1,
  },
  companyInfoContainer: {
    flexDirection: Platform.isTV ? "row" : "column",
    marginBottom: 24,
    alignItems: Platform.isTV ? "flex-start" : "center",
  },
  logoContainer: {
    marginRight: Platform.isTV ? 30 : 0,
    marginBottom: Platform.isTV ? 0 : 16,
    width: Platform.isTV ? 240 : 200,
    height: Platform.isTV ? 120 : 100,
    backgroundColor: "#222",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  logo: {
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
  noLogo: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  detailsContainer: {
    flex: 1,
  },
  name: {
    fontSize: Platform.isTV ? 32 : 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
    textAlign: Platform.isTV ? "left" : "center",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "#888",
    marginRight: 8,
  },
  infoValue: {
    fontSize: Platform.isTV ? 18 : 16,
    color: "white",
    flex: 1,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: Platform.isTV ? 24 : 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
  },
  movieItem: {
    marginRight: 16,
    marginBottom: 16,
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
    position: "absolute",
    bottom: 40,
    left: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#333",
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
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default CompanyPage;
