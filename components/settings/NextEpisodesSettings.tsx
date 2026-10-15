import { Ionicons } from "@expo/vector-icons";
import { useAtom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { useDownload } from "@/providers/DownloadProvider";
import { nextEpisodesCountChoices } from "@/providers/Downloads/nextEpisodes";
import {
  type NextEpisodesRule,
  nextEpisodesRulesAtom,
  rulesOfUser,
  withoutRule,
  withRule,
} from "@/providers/Downloads/nextEpisodesRules";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

const DropdownTrigger: React.FC<{ label: string }> = ({ label }) => (
  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
    <Text className='mr-1 text-[#8E8D91]'>{label}</Text>
    <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
  </View>
);

/**
 * "Keep next episodes downloaded": the defaults every series rule follows,
 * and the series that have one, each to change or stop.
 */
export const NextEpisodesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const [rules, setRules] = useAtom(nextEpisodesRulesAtom);
  const { runNextEpisodesCheck } = useDownload();
  const userId = user?.Id;
  const seriesRules = rulesOfUser(rules, userId);

  const countLabel = (count: number) =>
    t("home.settings.downloads.episode_count", { count });

  const countLocked = pluginSettings?.nextEpisodesDownloadCount?.locked;
  const countOptions = useMemo(
    () => [
      {
        options: nextEpisodesCountChoices(
          settings.nextEpisodesDownloadCount,
        ).map((count) => ({
          type: "radio" as const,
          label: t("home.settings.downloads.episode_count", { count }),
          value: String(count),
          selected: count === settings.nextEpisodesDownloadCount,
          onPress: () => updateSettings({ nextEpisodesDownloadCount: count }),
        })),
      },
    ],
    [settings.nextEpisodesDownloadCount, updateSettings, t],
  );

  const changeRule = (seriesId: string, change: Partial<NextEpisodesRule>) => {
    if (!userId) return;
    setRules((current) => {
      const stored = current[userId]?.[seriesId];
      return stored
        ? withRule(current, userId, { ...stored, ...change })
        : current;
    });
    runNextEpisodesCheck();
  };

  const stopRule = (seriesId: string) => {
    if (!userId) return;
    setRules((current) => withoutRule(current, userId, seriesId));
  };

  const ruleOptions = (rule: NextEpisodesRule) => [
    {
      title: t("home.settings.downloads.episodes_to_keep"),
      options: nextEpisodesCountChoices(rule.count).map((count) => ({
        type: "radio" as const,
        label: countLabel(count),
        value: String(count),
        selected: count === rule.count,
        onPress: () => changeRule(rule.seriesId, { count }),
      })),
    },
    {
      options: [
        {
          type: "toggle" as const,
          label: t("item_card.download.delete_watched_episodes"),
          value: rule.deleteWatched,
          onToggle: () =>
            changeRule(rule.seriesId, { deleteWatched: !rule.deleteWatched }),
        },
        {
          type: "action" as const,
          label: t("home.settings.downloads.stop_keeping"),
          onPress: () => stopRule(rule.seriesId),
        },
      ],
    },
  ];

  return (
    <View className='flex flex-col'>
      <ListGroup
        title={t("home.settings.downloads.next_episodes_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.downloads.next_episodes_description")}
          </Text>
        }
      >
        <ListItem
          title={t("home.settings.downloads.default_count")}
          subtitle={t("home.settings.downloads.default_count_hint")}
          disabledByAdmin={countLocked}
        >
          <PlatformDropdown
            // A locked setting is not written, so the menu must not open
            // on choices that would do nothing.
            disabled={countLocked}
            groups={countOptions}
            trigger={
              <DropdownTrigger
                label={countLabel(settings.nextEpisodesDownloadCount)}
              />
            }
            title={t("home.settings.downloads.default_count")}
          />
        </ListItem>
        <ListItem
          title={t("home.settings.downloads.wifi_only")}
          subtitle={t("home.settings.downloads.wifi_only_hint")}
          disabledByAdmin={pluginSettings?.nextEpisodesWifiOnly?.locked}
        >
          <SettingSwitch
            accessibilityLabel={t("home.settings.downloads.wifi_only")}
            value={settings.nextEpisodesWifiOnly}
            disabled={pluginSettings?.nextEpisodesWifiOnly?.locked}
            onValueChange={(value) => {
              updateSettings({ nextEpisodesWifiOnly: value });
              runNextEpisodesCheck();
            }}
          />
        </ListItem>
        <ListItem
          title={t("home.settings.downloads.delete_any_download")}
          subtitle={t("home.settings.downloads.delete_any_download_hint")}
          disabledByAdmin={
            pluginSettings?.nextEpisodesDeleteAnyDownload?.locked
          }
        >
          <SettingSwitch
            accessibilityLabel={t(
              "home.settings.downloads.delete_any_download",
            )}
            value={settings.nextEpisodesDeleteAnyDownload}
            disabled={pluginSettings?.nextEpisodesDeleteAnyDownload?.locked}
            onValueChange={(value) => {
              updateSettings({ nextEpisodesDeleteAnyDownload: value });
              runNextEpisodesCheck();
            }}
          />
        </ListItem>
      </ListGroup>

      <View className='mt-4'>
        <ListGroup title={t("home.settings.downloads.series_title")}>
          {seriesRules.length === 0 ? (
            <ListItem title={t("home.settings.downloads.no_series")} />
          ) : (
            seriesRules.map((rule) => (
              <ListItem
                key={rule.seriesId}
                title={rule.seriesName}
                subtitle={
                  rule.deleteWatched
                    ? t("home.settings.downloads.series_rule_delete", {
                        count: rule.count,
                      })
                    : t("home.settings.downloads.series_rule", {
                        count: rule.count,
                      })
                }
              >
                <PlatformDropdown
                  groups={ruleOptions(rule)}
                  trigger={
                    <DropdownTrigger
                      label={t("home.settings.downloads.change")}
                    />
                  }
                  title={rule.seriesName}
                />
              </ListItem>
            ))
          )}
        </ListGroup>
      </View>
    </View>
  );
};
