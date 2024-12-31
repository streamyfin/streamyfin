import { Text } from "@/components/common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { getLocales } from "expo-localization";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, ViewProps } from "react-native";

interface Props extends ViewProps {}

export const LanguageSwitcher: React.FC<Props> = ({ ...props }) => {
  const { i18n } = useTranslation();

  const lngs = ["en", "fr", "sv"];

  const [settings, updateSettings] = useSettings();
  return (
    <View className="flex flex-row space-x-2" {...props}>
      {lngs.map((l) => (
        <TouchableOpacity
          key={l}
          onPress={() => {
            i18n.changeLanguage(l);
            updateSettings({ preferedLanguage: l });
          }}
        >
          <Text
            className={`uppercase ${
              i18n.language === l ? "text-blue-500" : "text-gray-400 underline"
            }`}
          >
            {l}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
