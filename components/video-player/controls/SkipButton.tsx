import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface SkipButtonProps {
  onPress: () => void;
  showButton: boolean;
  buttonText: string;
}

const SkipButton: React.FC<SkipButtonProps> = ({
  onPress,
  showButton,
  buttonText,
}) => {
  return (
    <View style={{ display: showButton ? "flex" : "none" }}>
      <TouchableOpacity onPress={onPress} style={styles.button}>
        <Text style={styles.text}>{buttonText}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 15,
    borderWidth: 2,
    borderColor: "#5A5454",
  },
  text: {
    color: "white",
    fontWeight: "bold",
  },
});

export default SkipButton;
