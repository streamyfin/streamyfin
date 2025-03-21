import React from "react";
import { Checkbox } from "expo-checkbox";
import { Text } from "react-native";
import { TouchableWithoutFeedback } from "react-native-gesture-handler";

export const SSLCheckbox: React.FC<{
  useSSL: boolean;
  setUseSSL: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ useSSL, setUseSSL }) => {
  return (
    <TouchableWithoutFeedback
      onPress={() => setUseSSL(!useSSL)}
      className="flex-row items-center mt-2 mb-2"
    >
      <Checkbox
        value={useSSL}
        onValueChange={setUseSSL}
        color={useSSL ? "#9333ea" : undefined} // Purple color when checked
        style={{ marginRight: 8, borderRadius: 4 }}
      />
      <Text className="text-gray-500 font-medium text-sm">USE SSL</Text>
    </TouchableWithoutFeedback>
  );
};
