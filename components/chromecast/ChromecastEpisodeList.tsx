/**
 * Episode List for Chromecast Player
 * Displays list of episodes for TV shows with thumbnails
 */

import { Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { truncateTitle } from "@/utils/casting/helpers";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface ChromecastEpisodeListProps {
  visible: boolean;
  onClose: () => void;
  currentItem: BaseItemDto | null;
  episodes: BaseItemDto[];
  onSelectEpisode: (episode: BaseItemDto) => void;
  api: Api | null;
}

export const ChromecastEpisodeList: React.FC<ChromecastEpisodeListProps> = ({
  visible,
  onClose,
  currentItem,
  episodes,
  onSelectEpisode,
  api,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  // Get unique seasons from episodes
  const seasons = useMemo(() => {
    const seasonSet = new Set<number>();
    for (const ep of episodes) {
      if (ep.ParentIndexNumber !== undefined && ep.ParentIndexNumber !== null) {
        seasonSet.add(ep.ParentIndexNumber);
      }
    }
    return Array.from(seasonSet).sort((a, b) => a - b);
  }, [episodes]);

  // Filter episodes by selected season and exclude virtual episodes
  const filteredEpisodes = useMemo(() => {
    let eps = episodes;

    // Filter by season if selected
    if (selectedSeason !== null) {
      eps = eps.filter((ep) => ep.ParentIndexNumber === selectedSeason);
    }

    // Filter out virtual episodes (episodes without actual video files)
    // LocationType === "Virtual" means the episode doesn't have a media file
    eps = eps.filter((ep) => ep.LocationType !== "Virtual");

    return eps;
  }, [episodes, selectedSeason]);

  // Set initial season to current episode's season
  useEffect(() => {
    if (currentItem?.ParentIndexNumber !== undefined) {
      setSelectedSeason(currentItem.ParentIndexNumber);
    }
  }, [currentItem]);

  useEffect(() => {
    if (visible && currentItem && filteredEpisodes.length > 0) {
      const currentIndex = filteredEpisodes.findIndex(
        (ep) => ep.Id === currentItem.Id,
      );
      if (currentIndex !== -1 && flatListRef.current) {
        // Delay to ensure FlatList is rendered
        const timeoutId = setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: currentIndex,
            animated: true,
            viewPosition: 0.5, // Center the item
          });
        }, 300);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [visible, currentItem, filteredEpisodes]);

  const renderEpisode = ({ item }: { item: BaseItemDto }) => {
    const isCurrentEpisode = item.Id === currentItem?.Id;

    return (
      <Pressable
        onPress={() => {
          onSelectEpisode(item);
          onClose();
        }}
        style={{
          flexDirection: "row",
          padding: 12,
          backgroundColor: isCurrentEpisode ? "#a855f7" : "transparent",
          borderRadius: 8,
          marginBottom: 8,
        }}
      >
        {/* Thumbnail */}
        <View
          style={{
            width: 120,
            height: 68,
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#1a1a1a",
          }}
        >
          {api && item.Id && (
            <Image
              source={{
                uri: getPrimaryImageUrl({ api, item }) || undefined,
              }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          )}
          {(!api || !item.Id) && (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name='film-outline' size={32} color='#333' />
            </View>
          )}
        </View>

        {/* Episode info */}
        <View style={{ flex: 1, marginLeft: 12, justifyContent: "center" }}>
          <Text
            style={{
              color: "white",
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 4,
            }}
            numberOfLines={1}
          >
            {item.IndexNumber}.{" "}
            {truncateTitle(item.Name || t("casting_player.unknown"), 30)}
          </Text>
          {item.Overview && (
            <Text
              style={{
                color: "#999",
                fontSize: 12,
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {item.Overview}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {item.ParentIndexNumber !== undefined &&
              item.IndexNumber !== undefined && (
                <Text
                  style={{ color: "#a855f7", fontSize: 11, fontWeight: "600" }}
                >
                  S{String(item.ParentIndexNumber).padStart(2, "0")}:E
                  {String(item.IndexNumber).padStart(2, "0")}
                </Text>
              )}
            {item.ProductionYear && (
              <Text style={{ color: "#666", fontSize: 11 }}>
                {item.ProductionYear}
              </Text>
            )}
            {item.RunTimeTicks && (
              <Text style={{ color: "#666", fontSize: 11 }}>
                {Math.round(item.RunTimeTicks / 600000000)}{" "}
                {t("casting_player.minutes_short")}
              </Text>
            )}
          </View>
        </View>

        {isCurrentEpisode && (
          <View
            style={{
              justifyContent: "center",
              marginLeft: 8,
            }}
          >
            <Ionicons name='play-circle' size={24} color='white' />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType='slide'
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            flex: 1,
            paddingTop: insets.top,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#333",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: seasons.length > 1 ? 12 : 0,
              }}
            >
              <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
                {t("casting_player.episodes")}
              </Text>
              <Pressable onPress={onClose} style={{ padding: 8 }}>
                <Ionicons name='close' size={24} color='white' />
              </Pressable>
            </View>

            {/* Season selector */}
            {seasons.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {seasons.map((season) => (
                  <Pressable
                    key={season}
                    onPress={() => setSelectedSeason(season)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 20,
                      backgroundColor:
                        selectedSeason === season ? "#a855f7" : "#1a1a1a",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 14,
                        fontWeight: selectedSeason === season ? "600" : "400",
                      }}
                    >
                      {t("casting_player.season", { number: season })}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Episode list */}
          <FlatList
            ref={flatListRef}
            data={filteredEpisodes}
            renderItem={renderEpisode}
            keyExtractor={(item, index) => item.Id || `episode-${index}`}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: insets.bottom + 16,
            }}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={(info) => {
              // Fallback if scroll fails
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 500);
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
