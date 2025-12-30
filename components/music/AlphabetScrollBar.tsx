import { memo, useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface AlphabetScrollBarProps {
  onLetterPress: (letter: string) => void;
}

const ALPHABET = [
  "#",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
];

function AlphabetScrollBarComponent({ onLetterPress }: AlphabetScrollBarProps) {
  const handleLetterPress = useCallback(
    (letter: string) => {
      onLetterPress(letter);
    },
    [onLetterPress],
  );

  return (
    <View style={styles.container}>
      {ALPHABET.map((letter) => (
        <TouchableOpacity
          key={letter}
          onPress={() => handleLetterPress(letter)}
          style={styles.letterButton}
          hitSlop={{ top: 2, bottom: 2, left: 10, right: 10 }}
        >
          <Text style={styles.letterText}>{letter}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    zIndex: 1000,
  },
  letterButton: {
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  letterText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9333ea",
  },
});

export const AlphabetScrollBar = memo(AlphabetScrollBarComponent);

/**
 * Helper function to normalize item names for alphabetical sorting
 * Removes "The" prefix and returns the first character for grouping
 */
export function getAlphabeticalKey(name: string | null | undefined): string {
  if (!name) return "#";

  // Remove leading "The " (case insensitive)
  const normalized = name.replace(/^the\s+/i, "").trim();

  if (!normalized) return "#";

  const firstChar = normalized.charAt(0).toUpperCase();

  // Check if it's a letter A-Z
  if (/[A-Z]/.test(firstChar)) {
    return firstChar;
  }

  // Everything else (numbers, special characters) goes to "#"
  return "#";
}

/**
 * Helper function to scroll/jump to items starting with a specific letter
 * Returns the index of the first item matching the letter
 */
export function findIndexForLetter(
  items: Array<{ Name?: string | null; SortName?: string | null }>,
  letter: string,
): number {
  const index = items.findIndex((item) => {
    const name = item.SortName || item.Name;
    const key = getAlphabeticalKey(name);
    return key === letter;
  });

  // Return the found index, or 0 if not found
  return index >= 0 ? index : 0;
}
