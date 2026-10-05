import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { ALPHABET } from "@/utils/jellyfin/alphabetJump";
import { scaleSize } from "@/utils/scaleSize";

const TVLetterButton: React.FC<{
  letter: string;
  active: boolean;
  onPress: () => void;
}> = ({ letter, active, onPress }) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.1, duration: 120 });

  return (
    // Every letter takes an equal share of the row, so "I" and "W" come out
    // the same size.
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      accessibilityRole='button'
      accessibilityState={{ selected: active }}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            alignItems: "center",
            paddingVertical: scaleSize(10),
            borderRadius: scaleSize(10),
            backgroundColor: focused
              ? "#fff"
              : active
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        <Text
          style={{
            fontSize: typography.callout,
            color: focused ? "#000" : "#fff",
            fontWeight: focused || active ? "700" : "400",
          }}
        >
          {letter}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

/**
 * The alphabet as one focusable row, for a TV library sorted by name. It runs
 * the full width of the page, so there is a letter above every poster.
 */
export const TVAlphabetRow: React.FC<{
  /** The letter the list is anchored at, if any. */
  active: string | null;
  onSelect: (letter: string) => void;
}> = ({ active, onSelect }) => (
  <View
    style={{
      flexDirection: "row",
      gap: scaleSize(8),
      paddingBottom: scaleSize(24),
    }}
  >
    {ALPHABET.map((letter) => (
      <TVLetterButton
        key={letter}
        letter={letter}
        active={letter === active}
        onPress={() => onSelect(letter)}
      />
    ))}
  </View>
);
