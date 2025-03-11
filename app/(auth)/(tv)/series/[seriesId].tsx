import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Text } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Colors } from "@/constants/Colors";
import { TVEpisodeItem } from "@/components/media/TVEpisodeItem";
import { AddToFavorites } from "@/components/AddToFavorites";
import { Ionicons } from "@expo/vector-icons";

// This is a completely new implementation for TV series detail page
export default function TVSeriesDetailPage() {
  console.log("RENDERING TV SERIES DETAIL PAGE - COMPLETELY NEW VERSION");
  
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { seriesId } = params as { seriesId: string };
  console.log("Series ID from params:", seriesId);
  
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [currentSeasonIndex, setCurrentSeasonIndex] = useState(0);
  
  // Fetch series details
  const { data: series } = useQuery({
    queryKey: ["series", seriesId],
    queryFn: async () => {
      console.log("Fetching series details for:", seriesId);
      if (!api || !user?.Id) {
        console.log("Missing API or user ID for series details");
        return null;
      }
      try {
        const result = await getUserItemData({
          api,
          userId: user.Id,
          itemId: seriesId,
        });
        console.log("Series details fetched:", result?.Name);
        return result;
      } catch (error) {
        console.error("Error fetching series details:", error);
        return null;
      }
    },
    enabled: !!api && !!user?.Id && !!seriesId,
  });
  
  // Fetch seasons
  const { data: seasons, isLoading: loadingSeasons } = useQuery({
    queryKey: ["seasons", seriesId],
    queryFn: async () => {
      console.log(`Fetching seasons for series ${series?.Name || seriesId}`);
      
      if (!api || !user?.Id || !seriesId) {
        console.log("Missing API, user ID, or series ID for seasons");
        return [];
      }
      
      try {
        const response = await api.axiosInstance.get(
          `${api.basePath}/Shows/${seriesId}/Seasons`,
          {
            params: {
              userId: user.Id,
              itemId: seriesId,
              Fields: "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
            },
            headers: {
              Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
            },
          }
        );

        const items = response.data.Items || [];
        console.log(`Found ${items.length} seasons for ${series?.Name || seriesId}`);
        
        if (items.length > 0) {
          console.log("First season:", {
            name: items[0].Name,
            index: items[0].IndexNumber,
            id: items[0].Id
          });
        }
        
        // Sort seasons by index number
        return items.sort((a, b) => {
          const aIndex = a.IndexNumber || 999;
          const bIndex = b.IndexNumber || 999;
          return aIndex - bIndex;
        });
      } catch (error) {
        console.error(`Error fetching seasons for ${series?.Name || seriesId}:`, error);
        return [];
      }
    },
    enabled: !!api && !!user?.Id && !!seriesId,
  });
  
  // Fetch episodes for current season
  const { data: episodes, isLoading: loadingEpisodes } = useQuery({
    queryKey: ["episodes", seriesId, seasons?.[currentSeasonIndex]?.Id],
    queryFn: async () => {
      if (!api || !user?.Id || !seriesId || !seasons || !seasons[currentSeasonIndex]?.Id) {
        console.log("Missing data for episode fetch:", {
          hasApi: !!api,
          hasUserId: !!user?.Id,
          hasSeriesId: !!seriesId,
          hasSeasons: !!seasons,
          seasonId: seasons?.[currentSeasonIndex]?.Id
        });
        return [];
      }

      const seasonId = seasons[currentSeasonIndex].Id;
      const seasonName = seasons[currentSeasonIndex].Name;
      console.log(`Fetching episodes for ${seasonName} (${seasonId})`);
      
      try {
        const res = await getTvShowsApi(api).getEpisodes({
          seriesId: seriesId,
          userId: user.Id,
          seasonId: seasonId,
          enableUserData: true,
          fields: ["MediaSources", "MediaStreams", "Overview", "PrimaryImageAspectRatio", "ImageTags"],
        });

        console.log(`Found ${res.data.Items?.length || 0} episodes for ${seasonName}`);
        return res.data.Items || [];
      } catch (error) {
        console.error(`Error fetching episodes for ${seasonName}:`, error);
        return [];
      }
    },
    enabled: !!api && !!user?.Id && !!seriesId && !!seasons && seasons.length > 0 && !!seasons[currentSeasonIndex]?.Id,
  });
  
  // Fetch next up episodes
  const { data: nextUp } = useQuery({
    queryKey: ["nextUp", seriesId],
    queryFn: async () => {
      if (!api || !user?.Id || !seriesId) return [];
      
      try {
        const response = await api.axiosInstance.get(
          `${api.basePath}/Shows/NextUp`,
          {
            params: {
              userId: user.Id,
              seriesId: seriesId,
              limit: 1,
              Fields: "MediaSources,MediaStreams,Overview,PrimaryImageAspectRatio,ImageTags",
            },
            headers: {
              Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
            },
          }
        );
        
        console.log(`Found ${response.data.Items?.length || 0} next up episodes`);
        return response.data.Items || [];
      } catch (error) {
        console.error("Error fetching next up:", error);
        return [];
      }
    },
    enabled: !!api && !!user?.Id && !!seriesId,
  });
  
  const backdropUrl = useMemo(() => {
    if (!api || !series) return undefined;
    return getBackdropUrl({
      api,
      item: series,
      quality: 90,
      width: 1920,
    });
  }, [api, series]);
  
  const logoUrl = useMemo(() => {
    if (!api || !series) return undefined;
    return getLogoImageUrlById({
      api,
      item: series,
    });
  }, [api, series]);

  const handlePrevSeason = useCallback(() => {
    console.log("Previous season button pressed");
    if (!seasons || seasons.length === 0) return;
    setCurrentSeasonIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, [seasons]);

  const handleNextSeason = useCallback(() => {
    console.log("Next season button pressed");
    if (!seasons || seasons.length === 0) return;
    setCurrentSeasonIndex(prev => (prev < seasons.length - 1 ? prev + 1 : prev));
  }, [seasons]);

  const currentSeason = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    return seasons[currentSeasonIndex];
  }, [seasons, currentSeasonIndex]);
  
  console.log("Current render state:", {
    hasSeasons: !!seasons && seasons.length > 0,
    seasonsCount: seasons?.length || 0,
    currentSeasonIndex,
    currentSeasonName: currentSeason?.Name,
    loadingSeasons,
    loadingEpisodes,
    episodesCount: episodes?.length || 0
  });
  
  if (!series) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("library.options.loading")}</Text>
      </View>
    );
  }
  
  return (
    <ScrollView style={styles.container}>
      {/* Debug banner */}
      <View style={styles.debugBanner}>
        <Text style={styles.debugText}>
          DEBUG: Series: {series.Name} | Seasons: {seasons?.length || 0} | Current Season: {currentSeason?.Name || "None"} | Episodes: {episodes?.length || 0}
        </Text>
      </View>
      
      {/* Hero section with backdrop */}
      <View style={styles.heroContainer}>
        {backdropUrl && (
          <Image
            source={{ uri: backdropUrl }}
            style={styles.backdropImage}
            contentFit="cover"
          />
        )}
        <View style={styles.heroOverlay}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logoImage}
              contentFit="contain"
            />
          ) : (
            <Text style={styles.seriesTitle}>{series.Name}</Text>
          )}
          
          <View style={styles.seriesInfo}>
            {series.ProductionYear && (
              <Text style={styles.seriesInfoText}>{series.ProductionYear}</Text>
            )}
            {series.OfficialRating && (
              <Text style={styles.seriesInfoText}>{series.OfficialRating}</Text>
            )}
            <AddToFavorites item={series} size="large" />
          </View>
          
          <Text style={styles.seriesOverview} numberOfLines={3}>
            {series.Overview}
          </Text>
        </View>
      </View>
      
      {/* Next Up section */}
      {nextUp && nextUp.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("series.next_up")}</Text>
          <View style={styles.episodeList}>
            {nextUp.map((episode) => (
              <TVEpisodeItem key={episode.Id} episode={episode} />
            ))}
          </View>
        </View>
      )}
      
      {/* Season selector and episodes */}
      <View style={styles.section}>
        {loadingSeasons ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t("library.options.loading_seasons")}</Text>
          </View>
        ) : seasons && seasons.length > 0 ? (
          <>
            {/* Season navigation - always visible */}
            <View style={styles.seasonHeader}>
              <Pressable 
                style={[
                  styles.seasonNavButton, 
                  currentSeasonIndex === 0 && styles.seasonNavButtonDisabled
                ]} 
                onPress={handlePrevSeason}
                disabled={currentSeasonIndex === 0}
              >
                <Ionicons 
                  name="chevron-back" 
                  size={24} 
                  color={currentSeasonIndex === 0 ? "#555" : "white"} 
                />
                <Text style={styles.seasonNavText}>Previous Season</Text>
              </Pressable>
              
              <Text style={styles.seasonTitle}>
                {currentSeason?.Name || "Loading..."}
              </Text>
              
              <Pressable 
                style={[
                  styles.seasonNavButton, 
                  currentSeasonIndex === seasons.length - 1 && styles.seasonNavButtonDisabled
                ]} 
                onPress={handleNextSeason}
                disabled={currentSeasonIndex === seasons.length - 1}
              >
                <Text style={styles.seasonNavText}>Next Season</Text>
                <Ionicons 
                  name="chevron-forward" 
                  size={24} 
                  color={currentSeasonIndex === seasons.length - 1 ? "#555" : "white"} 
                />
              </Pressable>
            </View>
            
            {loadingEpisodes ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t("library.options.loading_episodes")}</Text>
              </View>
            ) : episodes && episodes.length > 0 ? (
              <View style={styles.episodeList}>
                {episodes.map((episode) => (
                  <TVEpisodeItem key={episode.Id} episode={episode} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t("item_card.no_episodes_for_this_season")}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("item_card.no_seasons_available")}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  debugBanner: {
    backgroundColor: "red",
    padding: 10,
    zIndex: 1000,
  },
  debugText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "white",
    fontSize: 16,
  },
  heroContainer: {
    height: 500,
    position: "relative",
  },
  backdropImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 40,
    paddingTop: 100,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  logoImage: {
    height: 100,
    width: "50%",
    marginBottom: 20,
  },
  seriesTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: "white",
    marginBottom: 10,
  },
  seriesInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  seriesInfoText: {
    color: "white",
    fontSize: 16,
    marginRight: 20,
  },
  seriesOverview: {
    color: "white",
    fontSize: 16,
    lineHeight: 24,
  },
  section: {
    padding: 40,
  },
  seasonHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
    backgroundColor: "rgba(255, 0, 0, 0.3)",
    borderRadius: 10,
    padding: 15,
  },
  seasonNavButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },
  seasonNavButtonDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  seasonNavText: {
    color: "white",
    marginHorizontal: 5,
    fontSize: 16,
  },
  seasonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.primary,
    textAlign: "center",
    flex: 1,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 20,
  },
  episodeList: {
    gap: 20,
  },
  emptyContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 16,
  },
});