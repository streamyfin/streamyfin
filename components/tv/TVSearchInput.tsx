import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  Modal,
  Platform,
} from "react-native";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";

// TV-optimized keyboard layout
const TV_KEYBOARD = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M", ".", "-", "_"],
  ["SPACE", "BACKSPACE", "CLEAR", "DONE"],
];

interface TVSearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const TVSearchInput = ({
  value,
  onChangeText,
  placeholder = "Search...",
  onFocus,
  onBlur,
}: TVSearchInputProps) => {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Open the TV keyboard when the input is focused
  const handleInputPress = () => {
    setShowKeyboard(true);
    setFocused(true);
    onFocus?.();
  };

  // Handle key press on the TV keyboard
  const handleKeyPress = (key: string) => {
    switch (key) {
      case "SPACE":
        onChangeText(value + " ");
        break;
      case "BACKSPACE":
        onChangeText(value.slice(0, -1));
        break;
      case "CLEAR":
        onChangeText("");
        break;
      case "DONE":
        setShowKeyboard(false);
        setFocused(false);
        onBlur?.();
        break;
      default:
        onChangeText(value + key);
        break;
    }
  };

  // Render the keyboard with a simpler approach
  const renderKeyboard = () => (
    <View style={styles.keyboard}>
      {TV_KEYBOARD.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.keyboardRow}>
          {row.map((key, keyIndex) => {
            let keyWidth = 80;
            let keyStyle = styles.key;

            if (["SPACE", "BACKSPACE", "CLEAR", "DONE"].includes(key)) {
              keyWidth = key === "SPACE" ? 200 : 120;
              keyStyle = styles.specialKey;
            }

            return (
              <Pressable
                key={`key-${rowIndex}-${keyIndex}`}
                style={[keyStyle, { width: keyWidth }]}
                onPress={() => handleKeyPress(key)}
              >
                {key === "BACKSPACE" ? (
                  <Ionicons name="backspace" size={24} color="white" />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Input Field */}
      <Pressable
        style={[styles.inputContainer, focused && styles.inputContainerFocused]}
        onPress={handleInputPress}
      >
        <Ionicons
          name="search"
          size={24}
          color="white"
          style={styles.searchIcon}
        />
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {value || placeholder}
        </Text>
      </Pressable>

      {/* TV Keyboard Modal */}
      <Modal visible={showKeyboard} transparent={true} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.keyboardContainer}>
            {/* Display the current search text */}
            <View style={styles.searchDisplay}>
              <Text style={styles.searchDisplayText}>{value}</Text>
              <Pressable
                style={styles.closeButton}
                onPress={() => {
                  setShowKeyboard(false);
                  setFocused(false);
                  onBlur?.();
                }}
              >
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>

            {/* Keyboard layout */}
            {renderKeyboard()}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 15,
    borderWidth: 2,
    borderColor: "transparent",
  },
  inputContainerFocused: {
    borderColor: Colors.primary,
  },
  searchIcon: {
    marginRight: 10,
  },
  inputText: {
    color: "white",
    fontSize: 18,
    flex: 1,
  },
  placeholder: {
    color: "#888",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  keyboardContainer: {
    width: "80%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  searchDisplay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#121212",
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    width: "100%",
  },
  searchDisplayText: {
    color: "white",
    fontSize: 20,
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  keyboard: {
    width: "100%",
    alignItems: "center",
  },
  keyboardRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 10,
  },
  key: {
    width: 80,
    height: 60,
    backgroundColor: "#333",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    margin: 5,
  },
  specialKey: {
    height: 60,
    backgroundColor: "#444",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    margin: 5,
  },
  keyText: {
    color: "white",
    fontSize: 18,
  },
});
