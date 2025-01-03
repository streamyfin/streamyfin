import { TextInput, View, Linking } from "react-native";
import { Text } from "../common/Text";

interface Props {
  value: string;
  onChangeValue: (value: string) => void;
}

export const OptimizedServerForm: React.FC<Props> = ({
  value,
  onChangeValue,
}) => {
  const handleOpenLink = () => {
    Linking.openURL("https://github.com/streamyfin/optimized-versions-server");
  };

  return (
    <View>
      <View className="flex flex-col rounded-xl overflow-hidden pl-4 bg-neutral-900 px-4">
        <View className={`flex flex-row items-center bg-neutral-900 h-11 pr-4`}>
          <Text className="mr-4">URL</Text>
          <TextInput
            className="text-white"
            placeholder="http(s)://domain.org:port"
            value={value}
            keyboardType="url"
            returnKeyType="done"
            autoCapitalize="none"
            textContentType="URL"
            onChangeText={(text) => onChangeValue(text)}
          />
        </View>
      </View>
      <Text className="px-4 text-xs text-neutral-500 mt-1">
        Enter the URL for the optimize server. The URL should include http or
        https and optionally the port.{" "}
        <Text className="text-blue-500" onPress={handleOpenLink}>
          Read more about the optimize server.
        </Text>
      </Text>
    </View>
  );
};
