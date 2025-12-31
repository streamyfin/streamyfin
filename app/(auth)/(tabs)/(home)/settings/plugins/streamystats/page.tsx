import { useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const navigation = useNavigation();

  const { t } = useTranslation();

  const insets = useSafeAreaInsets();

  const {
    settings,
    updateSettings,
    pluginSettings,
    refreshStreamyfinPluginSettings,
  } = useSettings();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<string>(
    settings?.streamyStatsServerUrl || "",
  );

  const onSave = useCallback(
    (val: string) => {
      updateSettings({
        streamyStatsServerUrl: !val.endsWith("/") ? val : val.slice(0, -1),
      });
      toast.success(t("home.settings.plugins.streamystats.toasts.saved"));
    },
    [updateSettings, t],
  );

  const toggleMovieRecommendations = useCallback(
    (enabled: boolean) => {
      updateSettings({ streamyStatsMovieRecommendations: enabled });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "recommendations"],
      });
    },
    [updateSettings, queryClient],
  );

  const toggleSeriesRecommendations = useCallback(
    (enabled: boolean) => {
      updateSettings({ streamyStatsSeriesRecommendations: enabled });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "recommendations"],
      });
    },
    [updateSettings, queryClient],
  );

  const togglePromotedWatchlists = useCallback(
    (enabled: boolean) => {
      updateSettings({ streamyStatsPromotedWatchlists: enabled });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "promotedWatchlists"],
      });
    },
    [updateSettings, queryClient],
  );

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/streamystats");
  };

  const handleRefreshFromServer = useCallback(async () => {
    await refreshStreamyfinPluginSettings();
    setValue(settings?.streamyStatsServerUrl || "");
    toast.success(t("home.settings.plugins.streamystats.toasts.refreshed"));
  }, [refreshStreamyfinPluginSettings, settings?.streamyStatsServerUrl, t]);

  useEffect(() => {
    if (!pluginSettings?.streamyStatsServerUrl?.locked) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => onSave(value)} className='px-2'>
            <Text className='text-blue-500'>
              {t("home.settings.plugins.streamystats.save_button")}
            </Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [
    navigation,
    value,
    pluginSettings?.streamyStatsServerUrl?.locked,
    onSave,
    t,
  ]);

  if (!settings) return null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='px-4'>
        <ListGroup>
          <ListItem
            title={t("home.settings.plugins.streamystats.enable_streamystats")}
            disabledByAdmin={
              pluginSettings?.searchEngine?.locked === true ||
              !!pluginSettings?.streamyStatsServerUrl?.value
            }
            onPress={() => {
              updateSettings({ searchEngine: "Jellyfin" });
              queryClient.invalidateQueries({ queryKey: ["search"] });
            }}
          >
            <Switch
              value={settings.searchEngine === "Streamystats"}
              disabled={!!pluginSettings?.streamyStatsServerUrl?.value}
              onValueChange={(val) => {
                updateSettings({
                  searchEngine: val ? "Streamystats" : "Jellyfin",
                });
                queryClient.invalidateQueries({ queryKey: ["search"] });
              }}
            />
          </ListItem>
        </ListGroup>

        <ListGroup className='mt-2'>
          <ListItem
            title={t("home.settings.plugins.streamystats.url")}
            disabledByAdmin={
              pluginSettings?.streamyStatsServerUrl?.locked === true
            }
          >
            <TextInput
              editable={
                settings.searchEngine === "Streamystats" &&
                !pluginSettings?.streamyStatsServerUrl?.locked
              }
              className='text-white text-right flex-1'
              placeholder={t(
                "home.settings.plugins.streamystats.server_url_placeholder",
              )}
              value={value}
              keyboardType='url'
              returnKeyType='done'
              autoCapitalize='none'
              textContentType='URL'
              onChangeText={(text) => setValue(text)}
            />
          </ListItem>
        </ListGroup>
        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.plugins.streamystats.streamystats_search_hint")}{" "}
          <Text className='text-blue-500' onPress={handleOpenLink}>
            {t(
              "home.settings.plugins.streamystats.read_more_about_streamystats",
            )}
          </Text>
        </Text>

        <ListGroup
          title={t("home.settings.plugins.streamystats.home_sections_title")}
          className='mt-4'
        >
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_movie_recommendations",
            )}
            disabledByAdmin={
              pluginSettings?.streamyStatsMovieRecommendations?.locked === true
            }
          >
            <Switch
              value={settings.streamyStatsMovieRecommendations ?? false}
              onValueChange={toggleMovieRecommendations}
              disabled={!settings.streamyStatsServerUrl}
            />
          </ListItem>
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_series_recommendations",
            )}
            disabledByAdmin={
              pluginSettings?.streamyStatsSeriesRecommendations?.locked === true
            }
          >
            <Switch
              value={settings.streamyStatsSeriesRecommendations ?? false}
              onValueChange={toggleSeriesRecommendations}
              disabled={!settings.streamyStatsServerUrl}
            />
          </ListItem>
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_promoted_watchlists",
            )}
            disabledByAdmin={
              pluginSettings?.streamyStatsPromotedWatchlists?.locked === true
            }
          >
            <Switch
              value={settings.streamyStatsPromotedWatchlists ?? false}
              onValueChange={togglePromotedWatchlists}
              disabled={!settings.streamyStatsServerUrl}
            />
          </ListItem>
        </ListGroup>
        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.plugins.streamystats.home_sections_hint")}
        </Text>

        <TouchableOpacity
          onPress={handleRefreshFromServer}
          className='mt-6 mb-4 py-3 rounded-xl bg-neutral-800'
        >
          <Text className='text-center text-red-500'>
            {t("home.settings.plugins.streamystats.refresh_from_server")}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
