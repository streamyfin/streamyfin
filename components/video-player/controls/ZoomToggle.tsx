import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";
import { ICON_SIZES } from "./constants";

interface ZoomToggleProps {
  isZoomedToFill: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const ZoomToggle: React.FC<ZoomToggleProps> = ({
  isZoomedToFill,
  onToggle,
  disabled = false,
}) => {
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (disabled) return;
    lightHapticFeedback();
    onToggle();
  };

  // Hide on TV platforms
  if (Platform.isTV) return null;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
    >
      <View style={{ opacity: disabled ? 0.5 : 1 }}>
        <Ionicons
          name={isZoomedToFill ? "contract-outline" : "expand-outline"}
          size={ICON_SIZES.HEADER}
          color='white'
        />
      </View>
    </TouchableOpacity>
  );
};
