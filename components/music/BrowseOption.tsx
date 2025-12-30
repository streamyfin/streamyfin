import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";

interface BrowseOptionProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

function BrowseOptionComponent({
  title,
  description,
  icon,
  onPress,
}: BrowseOptionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={48} color='#9333ea' />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1c1c1e",
    borderRadius: 12,
    padding: 20,
    minHeight: 140,
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
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "white",
  },
  description: {
    fontSize: 14,
    color: "#9ca3af",
  },
});

export const BrowseOption = memo(BrowseOptionComponent);
