import React, { PropsWithChildren } from "react";
import { Checkbox } from "expo-checkbox";
import { Text, View } from "react-native";
import { TouchableWithoutFeedback } from "react-native-gesture-handler";

interface SSLCheckboxProps
  extends React.ComponentProps<typeof TouchableWithoutFeedback> {
  onPress: () => void;
  useSSL: boolean;
}

export const SSLCheckbox: React.FC<PropsWithChildren<SSLCheckboxProps>> = ({
  onPress,
  useSSL,
}) => {
  return (
    <View className="my-2">
      <TouchableWithoutFeedback onPress={onPress} className="flex-row">
        <Checkbox
          value={useSSL}
          color={useSSL ? "#9333ea" : undefined} 
          style={{ marginRight: 8, borderRadius: 4 }}
        />
        <Text className="text-gray-500 font-medium text-sm">Use SSL</Text>
      </TouchableWithoutFeedback>
    </View>
  );
};
