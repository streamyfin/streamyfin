import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useSettings } from "@/utils/atoms/settings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import React, {useEffect, useMemo, useState} from "react";
import {
  Linking,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { toast } from "sonner-native";
import DisabledSetting from "@/components/settings/DisabledSetting";

export default function page() {
  const navigation = useNavigation();

  const [settings, updateSettings, pluginSettings] = useSettings();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<string>(settings?.marlinServerUrl || "");

  const onSave = (val: string) => {
    updateSettings({
      marlinServerUrl: !val.endsWith("/") ? val : val.slice(0, -1),
    });
    toast.success("Saved");
  };

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/marlin-search");
  };

  const disabled = useMemo(() => {
    return pluginSettings?.searchEngine?.locked === true && pluginSettings?.marlinServerUrl?.locked === true
  }, [pluginSettings]);

  useEffect(() => {
    if (!pluginSettings?.marlinServerUrl?.locked) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => onSave(value)}>
            <Text className="text-blue-500">Save</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, value]);

  if (!settings) return null;

  return (
    <DisabledSetting
      disabled={disabled}
      className="px-4"
    >
      <ListGroup>
        <DisabledSetting
          disabled={pluginSettings?.searchEngine?.locked === true}
          showText={!pluginSettings?.marlinServerUrl?.locked}
        >
          <ListItem
            title={"Enable Marlin Search"}
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
        </DisabledSetting>
      </ListGroup>

      <DisabledSetting
        disabled={pluginSettings?.marlinServerUrl?.locked === true}
        showText={!pluginSettings?.searchEngine?.locked}
        className="mt-2 flex flex-col rounded-xl overflow-hidden pl-4 bg-neutral-900 px-4"
      >
        <View
          className={`flex flex-row items-center bg-neutral-900 h-11 pr-4`}
        >
          <Text className="mr-4">URL</Text>
          <TextInput
            editable={settings.searchEngine === "Marlin"}
            className="text-white"
            placeholder="http(s)://domain.org:port"
            value={value}
            keyboardType="url"
            returnKeyType="done"
            autoCapitalize="none"
            textContentType="URL"
            onChangeText={(text) => setValue(text)}
          />
        </View>
      </DisabledSetting>
      <Text className="px-4 text-xs text-neutral-500 mt-1">
        Enter the URL for the Marlin server. The URL should include http or
        https and optionally the port.{" "}
        <Text className="text-blue-500" onPress={handleOpenLink}>
          Read more about Marlin.
        </Text>
      </Text>
    </DisabledSetting>
  );
}
