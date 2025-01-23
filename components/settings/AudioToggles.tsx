import { TouchableOpacity, View, ViewProps } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Ionicons } from "@expo/vector-icons";

interface Props extends ViewProps {}

export const AudioToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;

  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={"Audio"}
        description={
          <Text className="text-[#8E8D91] text-xs">
            Choose a default audio language.
          </Text>
        }
      >
        <ListItem title={"Set Audio Track From Previous Item"}>
          <Switch
            value={settings.rememberAudioSelections}
            onValueChange={(value) =>
              updateSettings({ rememberAudioSelections: value })
            }
          />
        </ListItem>
        <ListItem title="Audio language">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3 ">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.defaultAudioLanguage?.DisplayName || "None"}
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
                key={"none-audio"}
                onSelect={() => {
                  updateSettings({
                    defaultAudioLanguage: null,
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
                      defaultAudioLanguage: l,
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
      </ListGroup>
    </View>
  );
};
