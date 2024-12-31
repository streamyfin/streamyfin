import { useSettings } from "@/utils/atoms/settings";
import { TouchableOpacity, View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {}

export const MediaToggles: React.FC<Props> = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();
  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <View>
      <Text className="text-lg font-bold mb-2">{t("home.settings.media.media_title")}</Text>
      <View className="flex flex-col rounded-xl mb-4 overflow-hidden  divide-y-2 divide-solid divide-neutral-800">
        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">{t("home.settings.media.forward_skip_length")}</Text>
            <Text className="text-xs opacity-50">
              {t("home.settings.media.forward_skip_length_hint")}
            </Text>
          </View>
          <View className="flex flex-row items-center">
            <TouchableOpacity
              onPress={() =>
                updateSettings({
                  forwardSkipTime: Math.max(0, settings.forwardSkipTime - 5),
                })
              }
              className="w-8 h-8 bg-neutral-800 rounded-l-lg flex items-center justify-center"
            >
              <Text>-</Text>
            </TouchableOpacity>
            <Text className="w-12 h-8 bg-neutral-800 first-letter:px-3 py-2 flex items-center justify-center">
              {settings.forwardSkipTime}s
            </Text>
            <TouchableOpacity
              className="w-8 h-8 bg-neutral-800 rounded-r-lg flex items-center justify-center"
              onPress={() =>
                updateSettings({
                  forwardSkipTime: Math.min(60, settings.forwardSkipTime + 5),
                })
              }
            >
              <Text>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">{t("home.settings.media.rewind_length")}</Text>
            <Text className="text-xs opacity-50">
              {t("home.settings.media.rewind_length_hint")}
            </Text>
          </View>
          <View className="flex flex-row items-center">
            <TouchableOpacity
              onPress={() =>
                updateSettings({
                  rewindSkipTime: Math.max(0, settings.rewindSkipTime - 5),
                })
              }
              className="w-8 h-8 bg-neutral-800 rounded-l-lg flex items-center justify-center"
            >
              <Text>-</Text>
            </TouchableOpacity>
            <Text className="w-12 h-8 bg-neutral-800 first-letter:px-3 py-2 flex items-center justify-center">
              {settings.rewindSkipTime}s
            </Text>
            <TouchableOpacity
              className="w-8 h-8 bg-neutral-800 rounded-r-lg flex items-center justify-center"
              onPress={() =>
                updateSettings({
                  rewindSkipTime: Math.min(60, settings.rewindSkipTime + 5),
                })
              }
            >
              <Text>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};
