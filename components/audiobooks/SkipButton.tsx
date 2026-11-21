import { MaterialCommunityIcons } from "@expo/vector-icons";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity } from "react-native";

interface Props {
  direction: "back" | "forward";
  seconds: number;
  size: number;
  onPress: () => void;
  disabled?: boolean;
}

/** Skip back or forward, its icon numbered with the seconds it moves. */
export const SkipButton: React.FC<Props> = ({
  direction,
  seconds,
  size,
  onPress,
  disabled,
}) => {
  const { t } = useTranslation();
  const base = direction === "back" ? "rewind" : "fast-forward";
  const numbered = `${base}-${seconds}`;
  const name = (
    numbered in MaterialCommunityIcons.glyphMap ? numbered : base
  ) as keyof typeof MaterialCommunityIcons.glyphMap;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      className='p-2'
      style={{ opacity: disabled ? 0.4 : 1 }}
      accessibilityRole='button'
      accessibilityLabel={t(
        direction === "back"
          ? "audiobooks.skip_back_seconds"
          : "audiobooks.skip_forward_seconds",
        { seconds },
      )}
    >
      <MaterialCommunityIcons name={name} size={size} color='white' />
    </TouchableOpacity>
  );
};
