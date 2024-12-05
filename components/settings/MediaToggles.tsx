import { useSettings } from "@/utils/atoms/settings";
import { TouchableOpacity, View, ViewProps } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { LANGUAGES } from "@/constants/Languages";
import { TextInput } from "react-native-gesture-handler";

interface Props extends ViewProps {}

export const MediaToggles: React.FC<Props> = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();

  if (!settings) return null;

  return (
    <View>
      <Text className="text-lg font-bold mb-2">Media</Text>
      <View className="flex flex-col rounded-xl mb-4 overflow-hidden  divide-y-2 divide-solid divide-neutral-800">
        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Audio language</Text>
            <Text className="text-xs opacity-50">
              Choose a default audio language.
            </Text>
          </View>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
                <Text>{settings?.defaultAudioLanguage?.label || "None"}</Text>
              </TouchableOpacity>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              loop={true}
              side="bottom"
              align="start"
              alignOffset={0}
              avoidCollisions={true}
              collisionPadding={8}
              sideOffset={8}
            >
              <DropdownMenu.Label>Languages</DropdownMenu.Label>
              <DropdownMenu.Item
                key={"none-audio"}
                onSelect={() => {
                  updateSettings({
                    defaultAudioLanguage: null,
                  });
                }}
              >
                <DropdownMenu.ItemTitle>None</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
              {LANGUAGES.map((l) => (
                <DropdownMenu.Item
                  key={l.value}
                  onSelect={() => {
                    updateSettings({
                      defaultAudioLanguage: l,
                    });
                  }}
                >
                  <DropdownMenu.ItemTitle>{l.label}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </View>
        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Subtitle language</Text>
            <Text className="text-xs opacity-50">
              Choose a default subtitle language.
            </Text>
          </View>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="bg-neutral-800 rounded-lg border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
                <Text>
                  {settings?.defaultSubtitleLanguage?.label || "None"}
                </Text>
              </TouchableOpacity>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              loop={true}
              side="bottom"
              align="start"
              alignOffset={0}
              avoidCollisions={true}
              collisionPadding={8}
              sideOffset={8}
            >
              <DropdownMenu.Label>Languages</DropdownMenu.Label>
              <DropdownMenu.Item
                key={"none-subs"}
                onSelect={() => {
                  updateSettings({
                    defaultSubtitleLanguage: null,
                  });
                }}
              >
                <DropdownMenu.ItemTitle>None</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
              {LANGUAGES.map((l) => (
                <DropdownMenu.Item
                  key={l.value}
                  onSelect={() => {
                    updateSettings({
                      defaultSubtitleLanguage: l,
                    });
                  }}
                >
                  <DropdownMenu.ItemTitle>{l.label}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </View>

        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Subtitle Size</Text>
            <Text className="text-xs opacity-50">
              Choose a default subtitle size.
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

        <View
          className={`
              flex flex-row items-center space-x-2 justify-between bg-neutral-900 p-4
            `}
        >
          <View className="flex flex-col shrink">
            <Text className="font-semibold">Forward skip length</Text>
            <Text className="text-xs opacity-50">
              Choose length in seconds when skipping in video playback.
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
            <Text className="font-semibold">Rewind length</Text>
            <Text className="text-xs opacity-50">
              Choose length in seconds when skipping in video playback.
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
