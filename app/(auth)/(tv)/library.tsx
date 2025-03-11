import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TVFocusGuideView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api/user-views-api";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { Colors } from "@/constants/Colors";

export default function TVLibraryPage() {
  const { t } = useTranslation();
  const { api, user } = useJellyfin();
  const [libraries, setLibraries] = useState<BaseItemDto[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<BaseItemDto | null>(
    null,
  );
  const [libraryItems, setLibraryItems] = useState<BaseItemDto[]>([]);
  const [isFocused, setIsFocused] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!api || !user) return;

    const fetchLibraries = async () => {
      try {
        const response = await getUserViewsApi(api).getUserViews({
          userId: user.Id!,
        });
        setLibraries(response.data.Items || []);

        // Select first library by default
        if (response.data.Items && response.data.Items.length > 0) {
          setSelectedLibrary(response.data.Items[0]);
        }
      } catch (error) {
        console.error("Failed to fetch libraries:", error);
      }
    };

    fetchLibraries();
  }, [api, user]);

  useEffect(() => {
    if (!api || !user || !selectedLibrary) return;

    const fetchLibraryItems = async () => {
      setLoading(true);
      try {
        const response = await getItemsApi(api).getItems({
          userId: user.Id!,
          parentId: selectedLibrary.Id,
          sortBy: "SortName",
          sortOrder: "Ascending",
          recursive: true,
          fields: ["Overview", "PrimaryImageAspectRatio"],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        });
        setLibraryItems(response.data.Items || []);
      } catch (error) {
        console.error("Failed to fetch library items:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLibraryItems();
  }, [api, user, selectedLibrary]);

  const handleLibrarySelect = useCallback((library: BaseItemDto) => {
    setSelectedLibrary(library);
  }, []);

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
    setIsFocused((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleItemBlur = useCallback((id: string) => {
    setIsFocused((prev) => ({ ...prev, [id]: false }));
  }, []);

  const renderLibraryItem = ({ item }: { item: BaseItemDto }) => {
    const isSelected = selectedLibrary?.Id === item.Id;

    return (
      <Pressable
        onFocus={() => handleItemFocus(item.Id!)}
        onBlur={() => handleItemBlur(item.Id!)}
        onPress={() => handleLibrarySelect(item)}
        style={[
          styles.libraryItem,
          isSelected && styles.selectedLibrary,
          isFocused[item.Id!] && styles.focusedLibraryItem,
        ]}
      >
        <Text style={styles.libraryName}>{item.Name}</Text>
      </Pressable>
    );
  };

  const renderMediaItem = ({ item }: { item: BaseItemDto }) => {
    const imageUrl = api?.getImageUrl(item.Id || "", {
      fillHeight: 300,
      fillWidth: 200,
      quality: 90,
    });

    return (
      <TVFocusGuideView style={styles.mediaItemContainer}>
        <Pressable
          onFocus={() => handleItemFocus(`media-${item.Id!}`)}
          onBlur={() => handleItemBlur(`media-${item.Id!}`)}
          onPress={() => handleItemPress(item)}
          style={[
            styles.mediaItem,
            isFocused[`media-${item.Id!}`] && styles.focusedItem,
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
      <View style={styles.sidebar}>
        <Text style={styles.sidebarTitle}>{t("libraries")}</Text>
        <FlatList
          data={libraries}
          renderItem={renderLibraryItem}
          keyExtractor={(item) => item.Id!}
          contentContainerStyle={styles.libraryList}
        />
      </View>

      <View style={styles.content}>
        {selectedLibrary && (
          <Text style={styles.contentTitle}>{selectedLibrary.Name}</Text>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t("loading")}</Text>
          </View>
        ) : (
          <FlatList
            data={libraryItems}
            renderItem={renderMediaItem}
            keyExtractor={(item) => item.Id!}
            numColumns={4}
            contentContainerStyle={styles.mediaGrid}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#121212",
  },
  sidebar: {
    width: 250,
    backgroundColor: "#1a1a1a",
    padding: 20,
  },
  sidebarTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    marginTop: 10,
  },
  libraryList: {
    paddingVertical: 10,
  },
  libraryItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
    borderRadius: 5,
  },
  selectedLibrary: {
    backgroundColor: Colors.primary,
  },
  focusedLibraryItem: {
    backgroundColor: Colors.primary,
    transform: [{ scale: 1.05 }],
  },
  libraryName: {
    color: "white",
    fontSize: 18,
  },
  content: {
    flex: 1,
    padding: 30,
  },
  contentTitle: {
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
  mediaGrid: {
    paddingVertical: 10,
  },
  mediaItemContainer: {
    width: "25%",
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
    aspectRatio: 2 / 3,
    borderRadius: 8,
  },
  mediaTitle: {
    color: "white",
    fontSize: 16,
    marginTop: 8,
    textAlign: "center",
  },
});
