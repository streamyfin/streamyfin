import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Switch, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { NEXT_EPISODES_COUNTS } from "@/constants/Downloads";
import { useDownload } from "@/providers/DownloadProvider";
import {
  type NextEpisodesRule,
  nextEpisodesRulesAtom,
  withoutRule,
  withRule,
} from "@/providers/Downloads/nextEpisodesRules";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

interface Props {
  seriesId: string;
  seriesName: string;
}

/**
 * "Keep next episodes downloaded" in the download sheet of a series, a season
 * or an episode. A change is saved at once and checked straight away, without
 * the sheet's download button: the rule downloads what it needs by itself.
 */
export const NextEpisodesRuleControls: React.FC<Props> = ({
  seriesId,
  seriesName,
}) => {
  const { t } = useTranslation();
  const user = useAtomValue(userAtom);
  const [rules, setRules] = useAtom(nextEpisodesRulesAtom);
  const { settings } = useSettings();
  const { runNextEpisodesCheck } = useDownload();
  const userId = user?.Id;
  const rule = userId ? rules[userId]?.[seriesId] : undefined;

  if (!userId) return null;

  // Merged into the stored rule, not the rendered one: a check that ran since
  // may have recorded the episodes it downloaded.
  const save = (change: Partial<NextEpisodesRule> | null) => {
    setRules((current) => {
      if (!change) return withoutRule(current, userId, seriesId);
      const stored: NextEpisodesRule = current[userId]?.[seriesId] ?? {
        seriesId,
        seriesName,
        count: settings.nextEpisodesDownloadCount,
        deleteWatched: false,
        downloadedIds: [],
      };
      return withRule(current, userId, { ...stored, ...change });
    });
    runNextEpisodesCheck();
  };

  return (
    <View className='flex flex-col w-full'>
      <View className='flex flex-row items-center justify-between w-full py-2'>
        <View className='flex-1 mr-4'>
          <Text>{t("item_card.download.keep_next_episodes")}</Text>
          <Text className='text-xs text-neutral-400'>
            {t("item_card.download.keep_next_episodes_hint")}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t("item_card.download.keep_next_episodes")}
          value={!!rule}
          onValueChange={(on) => save(on ? {} : null)}
        />
      </View>
      {rule && (
        <>
          <View className='flex flex-row items-center justify-between w-full py-2'>
            <Text>{t("item_card.download.next_episodes_count")}</Text>
            <View className='flex flex-row' accessibilityRole='radiogroup'>
              {NEXT_EPISODES_COUNTS.map((count) => {
                const selected = rule.count === count;
                return (
                  <TouchableOpacity
                    key={count}
                    accessibilityRole='radio'
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(
                      "item_card.download.next_episodes_count_option",
                      { count },
                    )}
                    onPress={() => save({ count })}
                    className={`ml-2 rounded-full px-4 py-1.5 ${
                      selected ? "bg-purple-600" : "bg-neutral-800"
                    }`}
                  >
                    <Text>{count}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View className='flex flex-row items-center justify-between w-full py-2'>
            <View className='flex-1 mr-4'>
              <Text>{t("item_card.download.delete_watched_episodes")}</Text>
              <Text className='text-xs text-neutral-400'>
                {settings.nextEpisodesDeleteAnyDownload
                  ? t("item_card.download.delete_watched_episodes_any_hint")
                  : t("item_card.download.delete_watched_episodes_hint")}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t(
                "item_card.download.delete_watched_episodes",
              )}
              value={rule.deleteWatched}
              onValueChange={(deleteWatched) => save({ deleteWatched })}
            />
          </View>
        </>
      )}
    </View>
  );
};
