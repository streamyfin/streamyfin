import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Linking,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { toast } from "sonner-native";

export default function page() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  const [settings, updateSettings] = useSettings();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => onSave(value)}>
          <Text className="text-blue-500">{t("home.settings.plugins.marlin_search.save_button")}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, value]);

  if (!settings) return null;

  return (
    <View className="px-4">
      <ListGroup>
        <ListItem
          title={t("home.settings.plugins.marlin_search.enable_marlin_search")}
          onPress={() => {
            updateSettings({ searchEngine: "Jellyfin" });
            queryClient.invalidateQueries({ queryKey: ["search"] });
          }}
        >
          <Switch
            value={settings.searchEngine === "Marlin"}
            onValueChange={(value) => {
              updateSettings({ searchEngine: value ? "Marlin" : "Jellyfin" });
              queryClient.invalidateQueries({ queryKey: ["search"] });
            }}
          />
        </ListItem>
      </ListGroup>

      <View
        className={`mt-2 ${
          settings.searchEngine === "Marlin" ? "" : "opacity-50"
        }`}
      >
        <View className="flex flex-col rounded-xl overflow-hidden pl-4 bg-neutral-900 px-4">
          <View
            className={`flex flex-row items-center bg-neutral-900 h-11 pr-4`}
          >
            <Text className="mr-4">{t("home.settings.plugins.marlin_search.url")}</Text>
            <TextInput
              editable={settings.searchEngine === "Marlin"}
              className="text-white"
              placeholder={t("home.settings.plugins.marlin_search.server_url_placeholder")}
              value={value}
              keyboardType="url"
              returnKeyType="done"
              autoCapitalize="none"
              textContentType="URL"
              onChangeText={(text) => setValue(text)}
            />
          </View>
        </View>
        <Text className="px-4 text-xs text-neutral-500 mt-1">
            {t("home.settings.plugins.marlin_search.marlin_search_hint")}{" "}
          <Text className="text-blue-500" onPress={handleOpenLink}>
            {t("home.settings.plugins.marlin_search.read_more_about_marlin")}
          </Text>
        </Text>
      </View>
    </View>
  );
}
