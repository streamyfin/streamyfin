import { useTranslation } from "react-i18next";
import { Switch, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { nextEpisodesCountChoices } from "@/providers/Downloads/nextEpisodes";
import type { NextEpisodesRuleDraft } from "@/providers/Downloads/nextEpisodesRules";

interface Props {
  /** The rule as the sheet has it, or null while it is off. */
  draft: NextEpisodesRuleDraft | null;
  onChange: (draft: NextEpisodesRuleDraft | null) => void;
  /** The count a rule turned on here starts with. */
  defaultCount: number;
  /** Whether deleting watched episodes also takes the ones downloaded by hand. */
  deletesAnyDownload: boolean;
}

/**
 * "Keep next episodes downloaded" in the download sheet of a series, a season
 * or an episode. It only edits the sheet's choice: nothing is stored and
 * nothing downloads until the sheet's button is pressed.
 */
export const NextEpisodesRuleControls: React.FC<Props> = ({
  draft,
  onChange,
  defaultCount,
  deletesAnyDownload,
}) => {
  const { t } = useTranslation();

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
          value={!!draft}
          onValueChange={(on) =>
            onChange(on ? { count: defaultCount, deleteWatched: false } : null)
          }
        />
      </View>
      {draft && (
        <>
          <View className='flex flex-row items-center justify-between w-full py-2'>
            <Text>{t("item_card.download.next_episodes_count")}</Text>
            <View className='flex flex-row' accessibilityRole='radiogroup'>
              {nextEpisodesCountChoices(defaultCount, draft.count).map(
                (count) => {
                  const selected = draft.count === count;
                  return (
                    <TouchableOpacity
                      key={count}
                      accessibilityRole='radio'
                      accessibilityState={{ selected }}
                      accessibilityLabel={t(
                        "item_card.download.next_episodes_count_option",
                        { count },
                      )}
                      onPress={() => onChange({ ...draft, count })}
                      className={`ml-2 rounded-full px-4 py-1.5 ${
                        selected ? "bg-purple-600" : "bg-neutral-800"
                      }`}
                    >
                      <Text>{count}</Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </View>
          </View>
          <View className='flex flex-row items-center justify-between w-full py-2'>
            <View className='flex-1 mr-4'>
              <Text>{t("item_card.download.delete_watched_episodes")}</Text>
              <Text className='text-xs text-neutral-400'>
                {deletesAnyDownload
                  ? t("item_card.download.delete_watched_episodes_any_hint")
                  : t("item_card.download.delete_watched_episodes_hint")}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t(
                "item_card.download.delete_watched_episodes",
              )}
              value={draft.deleteWatched}
              onValueChange={(deleteWatched) =>
                onChange({ ...draft, deleteWatched })
              }
            />
          </View>
        </>
      )}
    </View>
  );
};
