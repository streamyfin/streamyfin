import { View } from "react-native";
import { Text } from "@/components/common/Text";

/**
 * A word on a card's artwork, for `CardSlots.overlay`: an air time, a missing
 * episode. Top left, where it clears the unwatched dot and the count badge.
 */
export const CardPill: React.FC<{ label: string }> = ({ label }) => (
  <View
    pointerEvents='none'
    style={{
      position: "absolute",
      top: 6,
      left: 6,
      height: 20,
      maxWidth: "90%",
      paddingHorizontal: 7,
      borderRadius: 10,
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.75)",
    }}
  >
    <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700" }}>
      {label}
    </Text>
  </View>
);
