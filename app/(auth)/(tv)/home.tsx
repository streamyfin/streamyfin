import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TVFocusGuideView } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { Colors } from "@/constants/Colors";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSettings } from "@/utils/atoms/settings";

export default function TVHomePage() {
  const { t } = useTranslation();
  const { api, user } = useJellyfin();
  const [settings] = useSettings();
  const [continueWatching, setContinueWatching] = useState<BaseItemDto[]>([]);
  const [latestMedia, setLatestMedia] = useState<BaseItemDto[]>([]);
  const [featuredItem, setFeaturedItem] = useState<BaseItemDto | null>(null);
  const [isFocused, setIsFocused] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (!api || !user) return;

    const fetchContinueWatching = async () => {
      try {
        const response = await getItemsApi(api).getResumeItems({
          userId: user.Id!,
          limit: 10,
        });
        setContinueWatching(response.data.Items || []);
        
        // Set the first item as featured
        if (response.data.Items && response.data.Items.length > 0) {
          setFeaturedItem(response.data.Items[0]);
        }
      } catch (error) {
        console.error("Failed to fetch continue watching items:", error);
      }
    };

    const fetchLatestMedia = async () => {
      try {
        const response = await getItemsApi(api).getItems({
          userId: user.Id!,
          sortBy: "DateCreated",
          sortOrder: "Descending",
          limit: 20,
          recursive: true,
          fields: ["Overview", "PrimaryImageAspectRatio"],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        });
        setLatestMedia(response.data.Items || []);
      } catch (error) {
        console.error("Failed to fetch latest media:", error);
      }
    };

    fetchContinueWatching();
    fetchLatestMedia();
  }, [api, user]);

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

  const renderMediaItem = ({ item }: { item: BaseItemDto }) => {
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
          hasTVPreferredFocus={false}
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

  const renderFeaturedItem = () => {
    if (!featuredItem) return null;

    const backdropUrl = api?.getImageUrl(featuredItem.Id || "", {
      type: "Backdrop",
      quality: 90,
      fillWidth: 1920,
    });

    return (
      <Pressable
        onPress={() => handleItemPress(featuredItem)}
        style={styles.featuredContainer}
        hasTVPreferredFocus={true}
      >
        <Image
          source={{ uri: backdropUrl }}
          style={styles.featuredBackdrop}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.featuredGradient}
        >
          <View style={styles.featuredContent}>
            <Text style={styles.featuredTitle}>{featuredItem.Name}</Text>
            <Text style={styles.featuredOverview} numberOfLines={2}>
              {featuredItem.Overview}
            </Text>
            <View style={styles.featuredButtonContainer}>
              <Pressable
                style={styles.playButton}
                onPress={() => handleItemPress(featuredItem)}
              >
                <Text style={styles.playButtonText}>{t("play")}</Text>
              </Pressable>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {renderFeaturedItem()}
            
            <Text style={styles.sectionTitle}>{t("continue_watching")}</Text>
            <FlatList
              horizontal
              data={continueWatching}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.Id!}
              contentContainerStyle={styles.horizontalList}
              showsHorizontalScrollIndicator={false}
            />
            
            <Text style={styles.sectionTitle}>{t("latest_additions")}</Text>
            <FlatList
              horizontal
              data={latestMedia}
              renderItem={renderMediaItem}
              keyExtractor={(item) => item.Id!}
              contentContainerStyle={styles.horizontalList}
              showsHorizontalScrollIndicator={false}
            />
          </>
        }
        style={styles.mainList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  mainList: {
    flex: 1,
  },
  featuredContainer: {
    height: 500,
    width: "100%",
    marginBottom: 30,
  },
  featuredBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  featuredContent: {
    padding: 40,
  },
  featuredTitle: {
    color: "white",
    fontSize: 48,
    fontWeight: "bold",
    marginBottom: 10,
  },
  featuredOverview: {
    color: "white",
    fontSize: 20,
    marginBottom: 20,
    opacity: 0.8,
    width: "50%",
  },
  featuredButtonContainer: {
    flexDirection: "row",
  },
  playButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 5,
  },
  playButtonText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  sectionTitle: {
    color: "white",
    fontSize: 30,
    fontWeight: "bold",
    marginLeft: 40,
    marginBottom: 20,
  },
  horizontalList: {
    paddingLeft: 40,
    paddingRight: 20,
    marginBottom: 40,
  },
  mediaItemContainer: {
    marginRight: 20,
  },
  mediaItem: {
    width: 200,
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
    height: 300,
    borderRadius: 8,
  },
  mediaTitle: {
    color: "white",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
});