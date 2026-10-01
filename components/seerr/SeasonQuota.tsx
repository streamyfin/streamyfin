import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors, SeerrStatusColors, SheetColors } from "@/constants/Colors";
import { quotaFill, seasonQuotaText } from "@/utils/seerr/quota";

interface Props {
  /** Season requests left once the seasons switched on are counted. */
  remaining: number;
  /** The series quota's limit, and the days it runs over. */
  limit?: number;
  days?: number;
  /**
   * The seasons a request needs when the quota left falls short of them: a
   * whole series on a server that takes nothing less, or the seasons chosen
   * once the quota changed under them.
   */
  overLimit?: number;
  restricted?: boolean;
}

/**
 * Seerr's quota line for a series (its QuotaDisplay): how many season
 * requests are left, over what period, and a bar of what is spent. When the
 * seasons a request needs do not fit, it says so.
 */
export const SeasonQuota: React.FC<Props> = ({
  remaining,
  limit,
  days,
  overLimit,
  restricted,
}) => {
  const { t } = useTranslation();
  const spent = remaining <= 0 || restricted || overLimit !== undefined;
  const tint = spent ? SeerrStatusColors.pending : Colors.primary;
  const words = seasonQuotaText(t, { remaining, limit, days, overLimit });

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: spent ? SeerrStatusColors.pending : undefined,
          }}
        >
          {words.status}
        </Text>
        {words.period && (
          <Text style={{ fontSize: 13, color: SheetColors.secondaryText }}>
            {words.period}
          </Text>
        )}
      </View>
      <View
        style={{
          height: 4,
          borderRadius: 2,
          marginTop: 6,
          overflow: "hidden",
          backgroundColor: SheetColors.group,
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${quotaFill(limit, remaining) * 100}%`,
            backgroundColor: tint,
            borderRadius: 2,
          }}
        />
      </View>
      {words.required && (
        <Text
          style={{
            marginTop: 6,
            fontSize: 13,
            color: SheetColors.secondaryText,
          }}
        >
          {words.required}
        </Text>
      )}
    </View>
  );
};
