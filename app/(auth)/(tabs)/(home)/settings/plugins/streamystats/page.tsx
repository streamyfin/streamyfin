import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Linking,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { HeaderButton } from "@/components/common/HeaderButton";
import { ServerUrlStatusText } from "@/components/common/ServerUrlStatusText";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useServerUrlResolver } from "@/hooks/useServerUrlResolver";
import { useSettings } from "@/utils/atoms/settings";
import { reachabilityProbe } from "@/utils/serverUrl/probes/reachability";

export default function StreamystatsPage() {
  useDismissKeyboardOnLeave();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { settings, updateSettings, pluginSettings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  // Local state for all editable fields
  const [url, setUrl] = useState<string>(settings?.streamyStatsServerUrl || "");
  const urlResolver = useServerUrlResolver(reachabilityProbe);
  const [useForSearch, setUseForSearch] = useState<boolean>(
    settings?.searchEngine === "Streamystats",
  );
  const [movieRecs, setMovieRecs] = useState<boolean>(
    settings?.streamyStatsMovieRecommendations ?? false,
  );
  const [seriesRecs, setSeriesRecs] = useState<boolean>(
    settings?.streamyStatsSeriesRecommendations ?? false,
  );
  const [promotedWatchlists, setPromotedWatchlists] = useState<boolean>(
    settings?.streamyStatsPromotedWatchlists ?? false,
  );
  const [hideWatchlistsTab, setHideWatchlistsTab] = useState<boolean>(
    settings?.hideWatchlistsTab ?? false,
  );

  const isUrlLocked = pluginSettings?.streamyStatsServerUrl?.locked === true;
  const searchLocked = pluginSettings?.searchEngine?.locked === true;
  const movieRecsLocked =
    pluginSettings?.streamyStatsMovieRecommendations?.locked === true;
  const seriesRecsLocked =
    pluginSettings?.streamyStatsSeriesRecommendations?.locked === true;
  const promotedWatchlistsLocked =
    pluginSettings?.streamyStatsPromotedWatchlists?.locked === true;
  const hideWatchlistsTabLocked =
    pluginSettings?.hideWatchlistsTab?.locked === true;
  // The input renders the locked admin URL; enablement must follow the same
  // effective value or every toggle stays disabled until local state syncs.
  const effectiveUrl = isUrlLocked
    ? (settings?.streamyStatsServerUrl ?? "")
    : url;
  const isStreamystatsEnabled = !!effectiveUrl;

  const onSave = useCallback(async () => {
    // Persist the canonical resolved URL when the server answers; keep the
    // raw input as fallback so the URL can be saved while the host is down.
    const raw = url.trim();
    let cleanUrl = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    if (raw && !isUrlLocked) {
      const result = await urlResolver.resolve(raw);
      if (result.ok) {
        cleanUrl = result.url;
        setUrl(result.url);
      }
    }
    updateSettings({
      streamyStatsServerUrl: cleanUrl,
      searchEngine: useForSearch ? "Streamystats" : "Jellyfin",
      streamyStatsMovieRecommendations: movieRecs,
      streamyStatsSeriesRecommendations: seriesRecs,
      streamyStatsPromotedWatchlists: promotedWatchlists,
      hideWatchlistsTab: hideWatchlistsTab,
    });
    queryClient.invalidateQueries({ queryKey: ["search"] });
    queryClient.invalidateQueries({ queryKey: ["streamystats"] });
    toast.success(t("home.settings.plugins.streamystats.toasts.saved"));
  }, [
    url,
    isUrlLocked,
    urlResolver.resolve,
    useForSearch,
    movieRecs,
    seriesRecs,
    promotedWatchlists,
    hideWatchlistsTab,
    updateSettings,
    queryClient,
    t,
  ]);

  // Set up header save button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton onPress={onSave}>
          <Text className='text-blue-500 font-medium'>
            {t("home.settings.plugins.streamystats.save")}
          </Text>
        </HeaderButton>
      ),
    });
  }, [navigation, onSave, t]);

  const handleClearStreamystats = useCallback(() => {
    setUrl("");
    setUseForSearch(false);
    setMovieRecs(false);
    setSeriesRecs(false);
    setPromotedWatchlists(false);
    setHideWatchlistsTab(false);
    updateSettings({
      streamyStatsServerUrl: "",
      searchEngine: "Jellyfin",
      streamyStatsMovieRecommendations: false,
      streamyStatsSeriesRecommendations: false,
      streamyStatsPromotedWatchlists: false,
      hideWatchlistsTab: false,
    });
    queryClient.invalidateQueries({ queryKey: ["streamystats"] });
    queryClient.invalidateQueries({ queryKey: ["search"] });
    toast.success(t("home.settings.plugins.streamystats.toasts.disabled"));
  }, [updateSettings, queryClient, t]);

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/streamystats");
  };

  if (!settings) return null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='px-4 pt-4'>
        <ListGroup className='flex-1'>
          <ListItem
            title={t("home.settings.plugins.streamystats.url")}
            disabledByAdmin={isUrlLocked}
          >
            <TextInput
              editable={!isUrlLocked}
              className='text-white text-right flex-1'
              placeholder={t(
                "home.settings.plugins.streamystats.server_url_placeholder",
              )}
              value={effectiveUrl}
              keyboardType='url'
              returnKeyType='done'
              autoCapitalize='none'
              textContentType='URL'
              onChangeText={(text) => {
                setUrl(text);
                // Editing invalidates the previous resolution status.
                urlResolver.reset();
              }}
              onBlur={() => {
                const candidate = url.trim();
                if (candidate) {
                  urlResolver.resolve(candidate).then((r) => {
                    if (r.ok) setUrl(r.url);
                  });
                }
              }}
            />
          </ListItem>
        </ListGroup>
        <View className='px-4 mt-1'>
          <ServerUrlStatusText state={urlResolver} />
        </View>

        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.plugins.streamystats.streamystats_search_hint")}{" "}
          <Text className='text-blue-500' onPress={handleOpenLink}>
            {t(
              "home.settings.plugins.streamystats.read_more_about_streamystats",
            )}
          </Text>
        </Text>

        <ListGroup
          title={t("home.settings.plugins.streamystats.features_title")}
          className='mt-4'
        >
          <ListItem
            title={t("home.settings.plugins.streamystats.enable_search")}
            disabledByAdmin={searchLocked}
          >
            {/* Locked controls show the live admin value and can't be toggled —
                local form state would let the switch flip while the write guard
                drops the change. */}
            <SettingSwitch
              value={
                searchLocked
                  ? settings?.searchEngine === "Streamystats"
                  : useForSearch
              }
              disabled={!isStreamystatsEnabled || searchLocked}
              onValueChange={setUseForSearch}
            />
          </ListItem>
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_movie_recommendations",
            )}
            disabledByAdmin={movieRecsLocked}
          >
            <SettingSwitch
              value={
                movieRecsLocked
                  ? (settings?.streamyStatsMovieRecommendations ?? false)
                  : movieRecs
              }
              onValueChange={setMovieRecs}
              disabled={!isStreamystatsEnabled || movieRecsLocked}
            />
          </ListItem>
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_series_recommendations",
            )}
            disabledByAdmin={seriesRecsLocked}
          >
            <SettingSwitch
              value={
                seriesRecsLocked
                  ? (settings?.streamyStatsSeriesRecommendations ?? false)
                  : seriesRecs
              }
              onValueChange={setSeriesRecs}
              disabled={!isStreamystatsEnabled || seriesRecsLocked}
            />
          </ListItem>
          <ListItem
            title={t(
              "home.settings.plugins.streamystats.enable_promoted_watchlists",
            )}
            disabledByAdmin={promotedWatchlistsLocked}
          >
            <SettingSwitch
              value={
                promotedWatchlistsLocked
                  ? (settings?.streamyStatsPromotedWatchlists ?? false)
                  : promotedWatchlists
              }
              onValueChange={setPromotedWatchlists}
              disabled={!isStreamystatsEnabled || promotedWatchlistsLocked}
            />
          </ListItem>
          <ListItem
            title={t("home.settings.plugins.streamystats.hide_watchlists_tab")}
            disabledByAdmin={hideWatchlistsTabLocked}
          >
            <SettingSwitch
              value={
                hideWatchlistsTabLocked
                  ? (settings?.hideWatchlistsTab ?? false)
                  : hideWatchlistsTab
              }
              onValueChange={setHideWatchlistsTab}
              disabled={!isStreamystatsEnabled || hideWatchlistsTabLocked}
            />
          </ListItem>
        </ListGroup>
        <Text className='px-4 text-xs text-neutral-500 mt-1'>
          {t("home.settings.plugins.streamystats.home_sections_hint")}
        </Text>

        {/* Disable button - only show if URL is not locked and Streamystats is enabled */}
        {!isUrlLocked && isStreamystatsEnabled && (
          <TouchableOpacity
            onPress={handleClearStreamystats}
            className='mt-3 mb-4 py-3 rounded-xl bg-neutral-800'
          >
            <Text className='text-center text-red-500'>
              {t("home.settings.plugins.streamystats.disable_streamystats")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}
