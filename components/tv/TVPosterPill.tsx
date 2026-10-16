import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

/**
 * A word on a TV poster, for `TVPosterCard`'s `overlay`: an air time, a
 * missing episode. Bottom left, clear of the "Now Playing" badge and of the
 * watched indicator.
 */
export const TVPosterPill: React.FC<{ label: string }> = ({ label }) => {
  const typography = useScaledTVTypography();
  return (
    <View
      pointerEvents='none'
      style={{
        position: "absolute",
        left: scaleSize(12),
        bottom: scaleSize(12),
        paddingHorizontal: scaleSize(12),
        paddingVertical: scaleSize(6),
        borderRadius: scaleSize(8),
        backgroundColor: "rgba(0,0,0,0.75)",
      }}
    >
      <Text style={{ fontSize: typography.callout, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
};
