import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { Platform, View } from "react-native";

export const WatchedIndicator: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  if (Platform.isTV) {
    // TV: Show white checkmark when watched
    if (
      item.UserData?.Played &&
      (item.Type === "Movie" || item.Type === "Episode")
    ) {
      return (
        <View
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            backgroundColor: "rgba(255,255,255,0.9)",
            borderRadius: 14,
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name='checkmark' size={18} color='black' />
        </View>
      );
    }
    return null;
  }

  // Mobile: Show purple triangle for unwatched
  return (
    <>
      {item.UserData?.Played === false &&
        (item.Type === "Movie" || item.Type === "Episode") && (
          <View className='bg-purple-600 w-8 h-8 absolute -top-4 -right-4 rotate-45' />
        )}
    </>
  );
};
