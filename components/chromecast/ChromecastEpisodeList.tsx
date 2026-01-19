/**
 * Episode List for Chromecast Player
 * Displays list of episodes for TV shows with thumbnails
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import React from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { truncateTitle } from "@/utils/casting/helpers";

interface ChromecastEpisodeListProps {
  visible: boolean;
  onClose: () => void;
  currentItem: BaseItemDto | null;
  episodes: BaseItemDto[];
  onSelectEpisode: (episode: BaseItemDto) => void;
}

export const ChromecastEpisodeList: React.FC<ChromecastEpisodeListProps> = ({
  visible,
  onClose,
  currentItem,
  episodes,
  onSelectEpisode,
}) => {
  const insets = useSafeAreaInsets();

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
          backgroundColor: isCurrentEpisode ? "#e50914" : "transparent",
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
          {item.ImageTags?.Primary && (
            <Image
              source={{
                uri: `${item.Id}/Images/Primary`,
              }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
            />
          )}
          {!item.ImageTags?.Primary && (
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
          <Text
            style={{
              color: "#999",
              fontSize: 12,
            }}
            numberOfLines={2}
          >
            {item.Overview || "No description available"}
          </Text>
          {item.RunTimeTicks && (
            <Text
              style={{
                color: "#666",
                fontSize: 11,
                marginTop: 4,
              }}
            >
              {Math.round((item.RunTimeTicks / 600000000) * 10) / 10} min
            </Text>
          )}
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
      animationType='slide'
      presentationStyle='pageSheet'
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#000",
          paddingTop: insets.top,
        }}
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
          data={episodes}
          renderItem={renderEpisode}
          keyExtractor={(item) => item.Id || ""}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 16,
          }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
};
