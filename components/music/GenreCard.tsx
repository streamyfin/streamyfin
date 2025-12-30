import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";

interface GenreCardProps {
  genreName: string;
  itemCount?: number;
  onPress: () => void;
}

function GenreCardComponent({ genreName, itemCount, onPress }: GenreCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <View style={styles.iconContainer}>
        <Ionicons name='musical-notes' size={40} color='#9333ea' />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.genreName} numberOfLines={2}>
          {genreName}
        </Text>
        {itemCount !== undefined && (
          <Text style={styles.count}>
            {itemCount} {itemCount === 1 ? "album" : "albums"}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
    padding: 16,
    minHeight: 160,
    marginRight: 16,
    marginBottom: 16,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  containerPressed: {
    opacity: 0.8,
    backgroundColor: "#252527",
  },
  iconContainer: {
    alignSelf: "flex-start",
  },
  textContainer: {
    gap: 4,
  },
  genreName: {
    fontSize: 18,
    fontWeight: "700",
    color: "white",
  },
  count: {
    fontSize: 12,
    color: "#9ca3af",
  },
});

export const GenreCard = memo(GenreCardComponent);
