import { TouchableOpacity, View, ViewProps } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;

  if (!settings) return null;

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  return (
    <View {...props}>
      <ListGroup
        title={"Subtitles"}
        description={
          <Text className="text-[#8E8D91] text-xs">
            Configure subtitle preferences.
          </Text>
        }
      >
        <ListItem title="Subtitle language">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.defaultSubtitleLanguage?.DisplayName || "None"}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
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
              {cultures?.map((l) => (
                <DropdownMenu.Item
                  key={l?.ThreeLetterISOLanguageName ?? "unknown"}
                  onSelect={() => {
                    updateSettings({
                      defaultSubtitleLanguage: l,
                    });
                  }}
                >
                  <DropdownMenu.ItemTitle>
                    {l.DisplayName}
                  </DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </ListItem>

        <ListItem title="Subtitle Mode">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.subtitleMode || "Loading"}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
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
              <DropdownMenu.Label>Subtitle Mode</DropdownMenu.Label>
              {subtitleModes?.map((l) => (
                <DropdownMenu.Item
                  key={l}
                  onSelect={() => {
                    updateSettings({
                      subtitleMode: l,
                    });
                  }}
                >
                  <DropdownMenu.ItemTitle>{l}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </ListItem>

        <ListItem title="Set Subtitle Track From Previous Item">
          <Switch
            value={settings.rememberSubtitleSelections}
            onValueChange={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
        </ListItem>

        <ListItem title="Subtitle Size">
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
            <Text className="w-12 h-8 bg-neutral-800 px-3 py-2 flex items-center justify-center">
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
        </ListItem>
      </ListGroup>
    </View>
  );
};
