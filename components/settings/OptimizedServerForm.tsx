import { TextInput, View, Linking } from "react-native";
import { Text } from "../common/Text";
import { useTranslation } from "react-i18next";

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

  const { t } = useTranslation();

  return (
    <View>
      <View className="flex flex-col rounded-xl overflow-hidden pl-4 bg-neutral-900 px-4">
        <View className={`flex flex-row items-center bg-neutral-900 h-11 pr-4`}>
          <Text className="mr-4">{t("home.settings.downloads.url")}</Text>
          <TextInput
            className="text-white"
            placeholder={t("home.settings.downloads.server_url_placeholder")}
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
        {t("home.settings.downloads.optimized_version_hint")}{" "}
        <Text className="text-blue-500" onPress={handleOpenLink}>
          {t("home.settings.downloads.read_more_about_optimized_server")}
        </Text>
      </Text>
    </View>
  );
};
