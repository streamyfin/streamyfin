/**
 * Episode List for Chromecast Player
 * Displays list of episodes for TV shows with thumbnails
 */

import { Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import React, { useEffect, useRef } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
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
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && currentItem && episodes.length > 0) {
      const currentIndex = episodes.findIndex((ep) => ep.Id === currentItem.Id);
      if (currentIndex !== -1 && flatListRef.current) {
        // Delay to ensure FlatList is rendered
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: currentIndex,
            animated: true,
            viewPosition: 0.5, // Center the item
          });
        }, 300);
      }
    }
  }, [visible, currentItem, episodes]);

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
            {item.IndexNumber}. {truncateTitle(item.Name || "Unknown", 30)}
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
            {item.ProductionYear && (
              <Text style={{ color: "#666", fontSize: 11 }}>
                {item.ProductionYear}
              </Text>
            )}
            {item.RunTimeTicks && (
              <Text style={{ color: "#666", fontSize: 11 }}>
                {Math.round(item.RunTimeTicks / 600000000)} min
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
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: "#333",
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              Episodes
            </Text>
            <Pressable onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name='close' size={24} color='white' />
            </Pressable>
          </View>

          {/* Episode list */}
          <FlatList
            ref={flatListRef}
            data={episodes}
            renderItem={renderEpisode}
            keyExtractor={(item) => item.Id || ""}
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
