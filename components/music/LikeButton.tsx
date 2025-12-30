import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { memo, useCallback } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useFavorite } from "@/hooks/useFavorite";

interface LikeButtonProps {
  item: BaseItemDto;
  size?: number;
  color?: string;
  activeColor?: string;
}

function LikeButtonComponent({
  item,
  size = 24,
  color = "#6b7280",
  activeColor = "#ef4444",
}: LikeButtonProps) {
  const { isFavorite, toggleFavorite } = useFavorite(item);

  const handlePress = useCallback(
    (e: any) => {
      e.stopPropagation();
      toggleFavorite();
    },
    [toggleFavorite],
  );

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.button}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons
        name={isFavorite ? "heart" : "heart-outline"}
        size={size}
        color={isFavorite ? activeColor : color}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
  },
});

export const LikeButton = memo(LikeButtonComponent);
