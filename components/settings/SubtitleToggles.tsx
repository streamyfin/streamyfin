import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useState } from "react";
import { Modal, TouchableOpacity, View, ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const [isLanguageModalVisible, setIsLanguageModalVisible] = useState(false);
  const [isModeModalVisible, setIsModeModalVisible] = useState(false);

  if (!settings) return null;

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  return (
    <View>
      <Text className="text-lg font-bold mb-2">Subtitle</Text>
      <View className="flex flex-col rounded-xl mb-4 overflow-hidden divide-y-2 divide-solid divide-neutral-800">
        <View className="flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4">
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Subtitle language</Text>
            <Text className="text-xs opacity-50">
              Choose a default subtitle language.
            </Text>
          </View>
          <TouchableOpacity
            className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsLanguageModalVisible(true)}
          >
            <Text>
              {settings?.defaultSubtitleLanguage?.DisplayName || "None"}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color="white"
              style={{ opacity: 0.5, marginLeft: 8 }}
            />
          </TouchableOpacity>
        </View>

        <View className="flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4">
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Subtitle Mode</Text>
            <Text className="text-xs opacity-50 mr-2">
              Subtitles are loaded based on the default and forced flags in the
              embedded metadata. Language preferences are considered when
              multiple options are available.
            </Text>
          </View>
          <TouchableOpacity
            className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between"
            onPress={() => setIsModeModalVisible(true)}
          >
            <Text>{settings?.subtitleMode || "Loading"}</Text>
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
              <Text className="font-semibold">
                Set Subtitle Track From Previous Item
              </Text>
              <Text className="text-xs opacity-50 min max-w-[85%]">
                Try to set the subtitle track to the closest match to the last
                video.
              </Text>
            </View>
            <Switch
              value={settings.rememberSubtitleSelections}
              onValueChange={(value) =>
                updateSettings({ rememberSubtitleSelections: value })
              }
            />
          </View>
        </View>

        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Subtitle Size</Text>
            <Text className="text-xs opacity-50">
              Choose a default subtitle size for direct play (only works for
              some subtitle formats).
            </Text>
          </View>
          <View className="flex flex-row items-center">
            <TouchableOpacity
              onPress={() =>
                updateSettings({
                  subtitleSize: Math.max(0, settings.subtitleSize - 5),
                })
              }
              className="w-8 h-8 bg-neutral-800 rounded-l-lg flex items-center justify-center"
            >
              <Text>-</Text>
            </TouchableOpacity>
            <Text className="w-12 h-8 bg-neutral-800 first-letter:px-3 py-2 flex items-center justify-center">
              {settings.subtitleSize}
            </Text>
            <TouchableOpacity
              className="w-8 h-8 bg-neutral-800 rounded-r-lg flex items-center justify-center"
              onPress={() =>
                updateSettings({
                  subtitleSize: Math.min(120, settings.subtitleSize + 5),
                })
              }
            >
              <Text>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <Modal
        visible={isLanguageModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsLanguageModalVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setIsLanguageModalVisible(false)}
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
                    defaultSubtitleLanguage: null,
                  });
                  setIsLanguageModalVisible(false);
                }}
              >
                <Text>None</Text>
                {!settings?.defaultSubtitleLanguage && (
                  <Ionicons name="checkmark" size={24} color="white" />
                )}
              </TouchableOpacity>

              {cultures?.map((l) => (
                <TouchableOpacity
                  key={l?.ThreeLetterISOLanguageName ?? "unknown"}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    updateSettings({
                      defaultSubtitleLanguage: l,
                    });
                    setIsLanguageModalVisible(false);
                  }}
                >
                  <Text>{l.DisplayName}</Text>
                  {settings?.defaultSubtitleLanguage
                    ?.ThreeLetterISOLanguageName ===
                    l.ThreeLetterISOLanguageName && (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={() => setIsLanguageModalVisible(false)}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Subtitle Mode Selection Modal */}
      <Modal
        visible={isModeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModeModalVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setIsModeModalVisible(false)}
        >
          <View className="mt-auto bg-neutral-900 rounded-t-xl">
            <View className="p-4 border-b border-neutral-800">
              <Text className="text-lg font-bold text-center">
                Select Subtitle Mode
              </Text>
            </View>

            <View className="max-h-[50%]">
              {subtitleModes?.map((mode) => (
                <TouchableOpacity
                  key={mode}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    updateSettings({
                      subtitleMode: mode,
                    });
                    setIsModeModalVisible(false);
                  }}
                >
                  <Text>{mode}</Text>
                  {settings?.subtitleMode === mode && (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={() => setIsModeModalVisible(false)}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};
