import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";

interface Props {
  /** Season requests left once the seasons switched on are counted. */
  remaining: number;
  /**
   * The seasons a request needs, when the server only takes whole series and
   * the quota falls short of them.
   */
  overLimit?: number;
  restricted?: boolean;
}

/**
 * Seerr's quota line for a series (its QuotaDisplay): how many season
 * requests are left, or that there are not enough for the whole series.
 */
export const SeasonQuota: React.FC<Props> = ({
  remaining,
  overLimit,
  restricted,
}) => {
  const { t } = useTranslation();
  const spent = remaining <= 0 || restricted;

  return (
    <View className='rounded-xl border border-neutral-800 px-3 py-2'>
      <Text className={spent ? "text-red-500" : "text-neutral-100"}>
        {overLimit !== undefined
          ? t("seerr.quota.not_enough_season_requests")
          : remaining <= 0
            ? t("seerr.quota.no_season_requests_remaining")
            : t("seerr.quota.season_requests_remaining", { count: remaining })}
      </Text>
      {overLimit !== undefined && (
        <Text className='mt-1 text-xs text-neutral-400'>
          {t("seerr.quota.required_season_requests", { count: overLimit })}
        </Text>
      )}
    </View>
  );
};
