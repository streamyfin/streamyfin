import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import type { SeasonBadge, SeasonRow } from "@/utils/seerr/seasons";

// Seerr's badge colours: plain, warning, primary and success.
const BADGE_COLOR: Record<SeasonBadge, string> = {
  not_requested: "bg-neutral-700",
  pending: "bg-yellow-600",
  requested: "bg-indigo-500",
  partially_available: "bg-green-600",
  available: "bg-green-600",
};

interface Props {
  rows: SeasonRow[];
  selected: number[];
  allSelected: boolean;
  onToggle: (seasonNumber: number) => void;
  onToggleAll: () => void;
}

/**
 * The season table of Seerr's request modal: a switch for all of them, then
 * one row per season with its switch, its episode count and its badge.
 */
export const SeasonRequestTable: React.FC<Props> = ({
  rows,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
}) => {
  const { t } = useTranslation();

  // Written out rather than built, so each key reads as used.
  const badgeText: Record<SeasonBadge, string> = {
    not_requested: t("seerr.season_badge.not_requested"),
    pending: t("seerr.season_badge.pending"),
    requested: t("seerr.season_badge.requested"),
    partially_available: t("seerr.season_badge.partially_available"),
    available: t("seerr.season_badge.available"),
  };

  return (
    <View className='rounded-xl border border-neutral-800 overflow-hidden'>
      <View className='flex flex-row items-center bg-neutral-800 px-3 py-2'>
        <View className='w-20'>
          <SettingSwitch value={allSelected} onValueChange={onToggleAll} />
        </View>
        <Text className='flex-1 text-xs text-neutral-400'>
          {t("seerr.season_column")}
        </Text>
        <Text className='w-16 text-xs text-neutral-400'>
          {t("seerr.episodes_column")}
        </Text>
        <Text className='w-32 text-xs text-neutral-400'>
          {t("seerr.status")}
        </Text>
      </View>
      {rows.map((row) => (
        <View
          key={row.seasonNumber}
          className='flex flex-row items-center border-t border-neutral-800 px-3 py-2'
        >
          <View className='w-20'>
            <SettingSwitch
              value={row.locked || selected.includes(row.seasonNumber)}
              disabled={row.locked}
              onValueChange={() => onToggle(row.seasonNumber)}
            />
          </View>
          <Text className='flex-1' numberOfLines={1}>
            {row.seasonNumber === 0
              ? t("seerr.specials")
              : t("seerr.season_number", { season_number: row.seasonNumber })}
          </Text>
          <Text className='w-16 text-neutral-300'>{row.episodeCount}</Text>
          <View className='w-32 flex flex-row'>
            {row.badge && (
              <View
                className={`${BADGE_COLOR[row.badge]} rounded-full px-2 py-0.5`}
              >
                <Text className='text-xs text-white' numberOfLines={1}>
                  {badgeText[row.badge]}
                </Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};
