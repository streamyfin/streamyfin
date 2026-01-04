import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useSettings } from "@/utils/atoms/settings";

export default function MusicSettingsPage() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <ListGroup
          title={t("home.settings.music.playback_title")}
          description={
            <Text className='text-[#8E8D91] text-xs'>
              {t("home.settings.music.playback_description")}
            </Text>
          }
        >
          <ListItem
            title={t("home.settings.music.prefer_downloaded")}
            disabled={pluginSettings?.preferLocalAudio?.locked}
          >
            <Switch
              value={settings.preferLocalAudio}
              disabled={pluginSettings?.preferLocalAudio?.locked}
              onValueChange={(value) =>
                updateSettings({ preferLocalAudio: value })
              }
            />
          </ListItem>
        </ListGroup>

        <View className='mt-4'>
          <ListGroup
            title={t("home.settings.music.caching_title")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("home.settings.music.caching_description")}
              </Text>
            }
          >
            <ListItem
              title={t("home.settings.music.lookahead_enabled")}
              disabled={pluginSettings?.audioLookaheadEnabled?.locked}
            >
              <Switch
                value={settings.audioLookaheadEnabled}
                disabled={pluginSettings?.audioLookaheadEnabled?.locked}
                onValueChange={(value) =>
                  updateSettings({ audioLookaheadEnabled: value })
                }
              />
            </ListItem>
          </ListGroup>
        </View>
      </View>
    </ScrollView>
  );
}
