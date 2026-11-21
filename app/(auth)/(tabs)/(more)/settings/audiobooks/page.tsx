import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import {
  AUDIOBOOK_PLAYBACK_RATES,
  AUDIOBOOK_SKIP_BACK_OPTIONS,
  AUDIOBOOK_SKIP_FORWARD_OPTIONS,
} from "@/constants/Audiobooks";
import { useHaptic } from "@/hooks/useHaptic";
import { userAtom } from "@/utils/atoms/api";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import { deleteBookDownload } from "@/utils/audiobooks/downloads";
import { formatRate } from "@/utils/audiobooks/format";
import { getDownloadedBooks } from "@/utils/audiobooks/storage";

type NumberSetting =
  | "audiobookSkipBackSeconds"
  | "audiobookSkipForwardSeconds"
  | "audiobookPlaybackRate";

/**
 * Audiobook playback: the skip intervals, which the lock screen uses too, the
 * speed, rewinding on resume, caching ahead and the downloaded books. Covered
 * by components/settings/AudiobookSettingsPage.test.tsx.
 */
export default function AudiobookSettingsPage() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const successHaptic = useHaptic("success");
  const [downloadedCount, setDownloadedCount] = useState(
    () => getDownloadedBooks(user?.ServerId).length,
  );

  const dropdown = useCallback(
    (
      key: NumberSetting,
      values: readonly number[],
      label: (value: number) => string,
    ) => {
      const locked = pluginSettings?.[key]?.locked;
      const groups = [
        {
          options: values.map((value) => ({
            type: "radio" as const,
            label: label(value),
            value: String(value),
            selected: settings[key] === value,
            onPress: () =>
              updateSettings({ [key]: value } as Partial<Settings>),
          })),
        },
      ];
      return (
        <PlatformDropdown
          disabled={locked}
          groups={groups}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>
                {label(settings[key])}
              </Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
        />
      );
    },
    [pluginSettings, settings, updateSettings],
  );

  const seconds = useCallback(
    (value: number) => t("audiobooks.settings.seconds", { count: value }),
    [t],
  );

  const onDeleteDownloads = useCallback(() => {
    Alert.alert(
      t("audiobooks.settings.delete_downloads"),
      t("audiobooks.settings.delete_downloads_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            for (const entry of getDownloadedBooks(user?.ServerId)) {
              await deleteBookDownload(entry.book);
            }
            setDownloadedCount(0);
            successHaptic();
            toast.success(t("audiobooks.settings.downloads_deleted"));
          },
        },
      ],
    );
  }, [t, user?.ServerId, successHaptic]);

  const rateLabel = useMemo(() => (value: number) => formatRate(value), []);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <ListGroup
          title={t("audiobooks.settings.playback_title")}
          description={
            <Text className='text-[#8E8D91] text-xs'>
              {t("audiobooks.settings.playback_description")}
            </Text>
          }
        >
          <ListItem
            title={t("audiobooks.settings.skip_back")}
            disabled={pluginSettings?.audiobookSkipBackSeconds?.locked}
          >
            {dropdown(
              "audiobookSkipBackSeconds",
              AUDIOBOOK_SKIP_BACK_OPTIONS,
              seconds,
            )}
          </ListItem>
          <ListItem
            title={t("audiobooks.settings.skip_forward")}
            disabled={pluginSettings?.audiobookSkipForwardSeconds?.locked}
          >
            {dropdown(
              "audiobookSkipForwardSeconds",
              AUDIOBOOK_SKIP_FORWARD_OPTIONS,
              seconds,
            )}
          </ListItem>
          <ListItem
            title={t("playback_speed.title")}
            disabled={pluginSettings?.audiobookPlaybackRate?.locked}
          >
            {dropdown(
              "audiobookPlaybackRate",
              AUDIOBOOK_PLAYBACK_RATES,
              rateLabel,
            )}
          </ListItem>
          <ListItem
            title={t("audiobooks.settings.auto_rewind")}
            subtitle={t("audiobooks.settings.auto_rewind_hint")}
            disabled={pluginSettings?.audiobookAutoRewind?.locked}
          >
            <SettingSwitch
              value={settings.audiobookAutoRewind}
              disabled={pluginSettings?.audiobookAutoRewind?.locked}
              onValueChange={(value) =>
                updateSettings({ audiobookAutoRewind: value })
              }
            />
          </ListItem>
        </ListGroup>

        <View className='mt-4'>
          <ListGroup
            title={t("audiobooks.settings.storage_title")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("audiobooks.settings.storage_description")}
              </Text>
            }
          >
            <ListItem
              title={t("audiobooks.settings.cache_next_part")}
              disabled={pluginSettings?.audiobookCacheNextPart?.locked}
            >
              <SettingSwitch
                value={settings.audiobookCacheNextPart}
                disabled={pluginSettings?.audiobookCacheNextPart?.locked}
                onValueChange={(value) =>
                  updateSettings({ audiobookCacheNextPart: value })
                }
              />
            </ListItem>
            <ListItem
              title={t("audiobooks.settings.delete_downloads")}
              subtitle={t("audiobooks.book_count", { count: downloadedCount })}
              textColor='red'
              disabled={downloadedCount === 0}
              onPress={onDeleteDownloads}
            />
          </ListGroup>
        </View>
      </View>
    </ScrollView>
  );
}
