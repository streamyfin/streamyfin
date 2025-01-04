import { TouchableOpacity, View, ViewProps, Modal } from "react-native";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

interface Props extends ViewProps {}

export const AudioToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const [isModalVisible, setIsModalVisible] = useState(false);

  if (!settings) return null;

  return (
    <View>
      <Text className="text-lg font-bold mb-2">Audio</Text>
      <View className="flex flex-col rounded-xl mb-4 overflow-hidden divide-y-2 divide-solid divide-neutral-800">
        <View className="flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4">
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Audio language</Text>
            <Text className="text-xs opacity-50">
              Choose a default audio language.
            </Text>
          </View>
          <TouchableOpacity
            className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModalVisible(true)}
          >
            <Text>{settings?.defaultAudioLanguage?.DisplayName || "None"}</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color="white"
              style={{ opacity: 0.5, marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>

        <View className="flex flex-col">
          <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
            <View className="flex flex-col">
              <Text className="font-semibold">Use Default Audio</Text>
              <Text className="text-xs opacity-50">
                Play default audio track regardless of language.
              </Text>
            </View>
            <Switch
              value={settings.playDefaultAudioTrack}
              onValueChange={(value) =>
                updateSettings({ playDefaultAudioTrack: value })
              }
            />
          </View>
        </View>

        <View className="flex flex-col">
          <View className="flex flex-row items-center justify-between bg-neutral-900 p-4">
            <View className="flex flex-col">
              <Text className="font-semibold">
                Set Audio Track From Previous Item
              </Text>
              <Text className="text-xs opacity-50 min max-w-[85%]">
                Try to set the audio track to the closest match to the last
                video.
              </Text>
            </View>
            <Switch
              value={settings.rememberAudioSelections}
              onValueChange={(value) =>
                updateSettings({ rememberAudioSelections: value })
              }
            />
          </View>
        </View>
      </View>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setIsModalVisible(false)}
        >
          <View className="mt-auto bg-neutral-900 rounded-t-xl">
            <View className="p-4 border-b border-neutral-800">
              <Text className="text-lg font-bold text-center">
                Select Language
              </Text>
            </View>

            <View className="max-h-[50%]">
              <TouchableOpacity
                className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                onPress={() => {
                  updateSettings({
                    defaultAudioLanguage: null,
                  });
                  setIsModalVisible(false);
                }}
              >
                <Text>None</Text>
                {!settings?.defaultAudioLanguage && (
                  <Ionicons name="checkmark" size={24} color="white" />
                )}
              </TouchableOpacity>

              {cultures?.map((l) => (
                <TouchableOpacity
                  key={l?.ThreeLetterISOLanguageName ?? "unknown"}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    updateSettings({
                      defaultAudioLanguage: l,
                    });
                    setIsModalVisible(false);
                  }}
                >
                  <Text>{l.DisplayName}</Text>
                  {settings?.defaultAudioLanguage
                    ?.ThreeLetterISOLanguageName ===
                    l.ThreeLetterISOLanguageName && (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={() => setIsModalVisible(false)}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};
