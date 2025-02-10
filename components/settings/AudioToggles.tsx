import { Platform, TouchableOpacity, View, ViewProps } from "react-native";
const DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/utils/atoms/settings";

interface Props extends ViewProps {}

export const AudioToggles: React.FC<Props> = ({ ...props }) => {
  if (Platform.isTV) return null;
  const media = useMedia();
  const [_, __, pluginSettings] = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.audio.audio_title")}
        description={
          <Text className="text-[#8E8D91] text-xs">
            {t("home.settings.audio.audio_hint")}
          </Text>
        }
      >
        <ListItem
          title={t("home.settings.audio.set_audio_track")}
          disabled={pluginSettings?.rememberAudioSelections?.locked}
        >
          <Switch
            value={settings.rememberAudioSelections}
            disabled={pluginSettings?.rememberAudioSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberAudioSelections: value })
            }
          />
        </ListItem>
        <ListItem title={t("home.settings.audio.audio_language")}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3 ">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.defaultAudioLanguage?.DisplayName ||
                    t("home.settings.audio.none")}
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
              <DropdownMenu.Label>
                {t("home.settings.audio.language")}
              </DropdownMenu.Label>
              <DropdownMenu.Item
                key={"none-audio"}
                onSelect={() => {
                  updateSettings({
                    defaultAudioLanguage: null,
                  });
                }}
              >
                <DropdownMenu.ItemTitle>
                  {t("home.settings.audio.none")}
                </DropdownMenu.ItemTitle>
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
