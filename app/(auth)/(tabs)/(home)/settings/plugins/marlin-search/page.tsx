import { useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Linking,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const navigation = useNavigation();

  const { t } = useTranslation();

  const insets = useSafeAreaInsets();

  const { settings, updateSettings, pluginSettings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const [value, setValue] = useState<string>(settings?.marlinServerUrl || "");

  const onSave = (val: string) => {
    updateSettings({
      marlinServerUrl: !val.endsWith("/") ? val : val.slice(0, -1),
    });
    toast.success(t("home.settings.plugins.marlin_search.toasts.saved"));
  };

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/marlin-search");
  };

  const disabled = useMemo(() => {
    return (
      pluginSettings?.searchEngine?.locked === true &&
      pluginSettings?.marlinServerUrl?.locked === true
    );
  }, [pluginSettings]);

  useEffect(() => {
    if (!pluginSettings?.marlinServerUrl?.locked) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => onSave(value)} className='px-2'>
            <Text className='text-blue-500'>
              {t("home.settings.plugins.marlin_search.save_button")}
            </Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, value, pluginSettings?.marlinServerUrl?.locked, t]);

  if (!settings) return null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <DisabledSetting disabled={disabled} className='px-4'>
        <ListGroup>
          <DisabledSetting
            disabled={
              pluginSettings?.searchEngine?.locked === true ||
              !!pluginSettings?.streamyStatsServerUrl?.value
            }
            showText={!pluginSettings?.marlinServerUrl?.locked}
          >
            <ListItem
              title={t(
                "home.settings.plugins.marlin_search.enable_marlin_search",
              )}
              onPress={() => {
                updateSettings({ searchEngine: "Jellyfin" });
                queryClient.invalidateQueries({ queryKey: ["search"] });
              }}
            >
              <Switch
                value={settings.searchEngine === "Marlin"}
                disabled={!!pluginSettings?.streamyStatsServerUrl?.value}
                onValueChange={(value) => {
                  updateSettings({
                    searchEngine: value ? "Marlin" : "Jellyfin",
                  });
                  queryClient.invalidateQueries({ queryKey: ["search"] });
                }}
              />
            </ListItem>
          </DisabledSetting>
        </ListGroup>

        <DisabledSetting
          disabled={pluginSettings?.marlinServerUrl?.locked === true}
          showText={!pluginSettings?.searchEngine?.locked}
          className='mt-2 flex flex-col rounded-xl overflow-hidden pl-4 bg-neutral-900 px-4'
        >
          <View
            className={"flex flex-row items-center bg-neutral-900 h-11 pr-4"}
          >
            <Text className='mr-4'>
              {t("home.settings.plugins.marlin_search.url")}
            </Text>
            <TextInput
              editable={settings.searchEngine === "Marlin"}
              className='text-white'
              placeholder={t(
                "home.settings.plugins.marlin_search.server_url_placeholder",
              )}
              value={value}
              keyboardType='url'
              returnKeyType='done'
              autoCapitalize='none'
              textContentType='URL'
              onChangeText={(text) => setValue(text)}
            />
          </View>
        </DisabledSetting>
        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.plugins.marlin_search.marlin_search_hint")}{" "}
          <Text className='text-blue-500' onPress={handleOpenLink}>
            {t("home.settings.plugins.marlin_search.read_more_about_marlin")}
          </Text>
        </Text>
      </DisabledSetting>
    </ScrollView>
  );
}
