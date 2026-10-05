import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { MUSIC_NORMALIZATION_MODES } from "@/constants/Music";
import { useHaptic } from "@/hooks/useHaptic";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import {
  clearCache,
  clearPermanentDownloads,
  getStorageStats,
} from "@/providers/AudioStorage";
import { useSettings } from "@/utils/atoms/settings";

const CACHE_SIZE_OPTIONS = [
  { label: "100 MB", value: 100 },
  { label: "250 MB", value: 250 },
  { label: "500 MB", value: 500 },
  { label: "1 GB", value: 1024 },
  { label: "2 GB", value: 2048 },
];

const NORMALIZATION_LABEL_KEYS = {
  off: "home.settings.music.normalization_off",
  track: "home.settings.music.normalization_track",
  album: "home.settings.music.normalization_album",
} as const;

const LOOKAHEAD_COUNT_OPTIONS = [
  { label: "1 song", value: 1 },
  { label: "2 songs", value: 2 },
  { label: "3 songs", value: 3 },
  { label: "5 songs", value: 5 },
];

export default function MusicSettingsPage() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const queryClient = useNetworkAwareQueryClient();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  const { data: musicCacheStats } = useQuery({
    queryKey: ["musicCacheStats"],
    queryFn: () => getStorageStats(),
  });

  const onClearMusicCacheClicked = useCallback(async () => {
    try {
      await clearCache();
      queryClient.invalidateQueries({ queryKey: ["musicCacheStats"] });
      queryClient.invalidateQueries({ queryKey: ["appSize"] });
      successHapticFeedback();
      toast.success(t("home.settings.storage.music_cache_cleared"));
    } catch (_e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  }, [queryClient, successHapticFeedback, errorHapticFeedback, t]);

  const onDeleteDownloadedSongsClicked = useCallback(async () => {
    try {
      await clearPermanentDownloads();
      queryClient.invalidateQueries({ queryKey: ["musicCacheStats"] });
      queryClient.invalidateQueries({ queryKey: ["appSize"] });
      successHapticFeedback();
      toast.success(t("home.settings.storage.downloaded_songs_deleted"));
    } catch (_e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  }, [queryClient, successHapticFeedback, errorHapticFeedback, t]);

  const normalizationOptions = useMemo(
    () => [
      {
        options: MUSIC_NORMALIZATION_MODES.map((mode) => ({
          type: "radio" as const,
          label: t(NORMALIZATION_LABEL_KEYS[mode]),
          value: mode,
          selected: mode === settings.musicNormalizationMode,
          onPress: () => updateSettings({ musicNormalizationMode: mode }),
        })),
      },
    ],
    [settings.musicNormalizationMode, updateSettings, t],
  );

  // A mode this build does not know (the plugin can push one) plays as off.
  const currentNormalizationLabelKey =
    NORMALIZATION_LABEL_KEYS[settings.musicNormalizationMode] ??
    NORMALIZATION_LABEL_KEYS.off;

  const cacheSizeOptions = useMemo(
    () => [
      {
        options: CACHE_SIZE_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: String(option.value),
          selected: option.value === settings?.audioMaxCacheSizeMB,
          onPress: () => updateSettings({ audioMaxCacheSizeMB: option.value }),
        })),
      },
    ],
    [settings?.audioMaxCacheSizeMB, updateSettings],
  );

  const currentCacheSizeLabel =
    CACHE_SIZE_OPTIONS.find((o) => o.value === settings?.audioMaxCacheSizeMB)
      ?.label ?? `${settings?.audioMaxCacheSizeMB} MB`;

  const lookaheadCountOptions = useMemo(
    () => [
      {
        options: LOOKAHEAD_COUNT_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: String(option.value),
          selected: option.value === settings?.audioLookaheadCount,
          onPress: () => updateSettings({ audioLookaheadCount: option.value }),
        })),
      },
    ],
    [settings?.audioLookaheadCount, updateSettings],
  );

  const currentLookaheadLabel =
    LOOKAHEAD_COUNT_OPTIONS.find(
      (o) => o.value === settings?.audioLookaheadCount,
    )?.label ?? `${settings?.audioLookaheadCount} songs`;

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
            <SettingSwitch
              value={settings.preferLocalAudio}
              disabled={pluginSettings?.preferLocalAudio?.locked}
              onValueChange={(value) =>
                updateSettings({ preferLocalAudio: value })
              }
            />
          </ListItem>
          <ListItem
            title={t("home.settings.music.normalization")}
            subtitle={t("home.settings.music.normalization_hint")}
            disabled={pluginSettings?.musicNormalizationMode?.locked}
          >
            <PlatformDropdown
              groups={normalizationOptions}
              trigger={
                <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                  <Text className='mr-1 text-[#8E8D91]'>
                    {t(currentNormalizationLabelKey)}
                  </Text>
                  <Ionicons
                    name='chevron-expand-sharp'
                    size={18}
                    color='#5A5960'
                  />
                </View>
              }
              title={t("home.settings.music.normalization")}
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
              <SettingSwitch
                value={settings.audioLookaheadEnabled}
                disabled={pluginSettings?.audioLookaheadEnabled?.locked}
                onValueChange={(value) =>
                  updateSettings({ audioLookaheadEnabled: value })
                }
              />
            </ListItem>
            <ListItem
              title={t("home.settings.music.lookahead_count")}
              disabled={
                pluginSettings?.audioLookaheadCount?.locked ||
                !settings.audioLookaheadEnabled
              }
            >
              <PlatformDropdown
                groups={lookaheadCountOptions}
                trigger={
                  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {currentLookaheadLabel}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t("home.settings.music.lookahead_count")}
              />
            </ListItem>
            <ListItem
              title={t("home.settings.music.max_cache_size")}
              disabled={pluginSettings?.audioMaxCacheSizeMB?.locked}
            >
              <PlatformDropdown
                groups={cacheSizeOptions}
                trigger={
                  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {currentCacheSizeLabel}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t("home.settings.music.max_cache_size")}
              />
            </ListItem>
          </ListGroup>
        </View>

        {!Platform.isTV && (
          <View className='mt-4'>
            <ListGroup
              title={t("home.settings.storage.music_cache_title")}
              description={
                <Text className='text-[#8E8D91] text-xs'>
                  {t("home.settings.storage.music_cache_description")}
                </Text>
              }
            >
              <ListItem
                onPress={onClearMusicCacheClicked}
                title={t("home.settings.storage.clear_music_cache")}
                subtitle={t("home.settings.storage.music_cache_size", {
                  size: (musicCacheStats?.cacheSize ?? 0).bytesToReadable(),
                })}
              />
            </ListGroup>
            <ListGroup className='mt-4'>
              <ListItem
                textColor='red'
                onPress={onDeleteDownloadedSongsClicked}
                title={t("home.settings.storage.delete_all_downloaded_songs")}
                subtitle={t("home.settings.storage.downloaded_songs_size", {
                  size: (musicCacheStats?.permanentSize ?? 0).bytesToReadable(),
                })}
              />
            </ListGroup>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
