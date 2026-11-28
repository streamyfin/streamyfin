import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type StyleProp,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Text } from "@/components/common/Text";
import type {
  DownloadDecisions,
  ItemDecision,
} from "@/hooks/useDownloadDecisions";
import { transcodeReasonLabel } from "@/utils/jellyfin/transcodeReasonLabel";

const pad = (value: number) => String(value).padStart(2, "0");

/** S01E03 for an episode, its name for anything else. */
const itemLabel = (item: BaseItemDto) =>
  item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${pad(item.ParentIndexNumber)}E${pad(item.IndexNumber)}`
    : (item.Name ?? "");

const reasonsOf = (t: TFunction, decision: ItemDecision) =>
  decision.decision?.kind === "transcode"
    ? decision.decision.reasons
        .map((reason) => transcodeReasonLabel(t, reason))
        .join(", ")
    : "";

/**
 * What the download sheet's choices will get from the server: the original
 * file or a transcode, and why. One item reads as a sentence; several as a
 * count, which opens into the items that will not come down as they are.
 */
export function DownloadDecisionSummary({
  decisions,
  style,
}: {
  decisions: DownloadDecisions;
  // The sheet's space-y column spaces its children through this.
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (decisions.total === 0) return null;

  if (decisions.total === 1) {
    const only = decisions.items[0];
    if (only.status === "failed") {
      return (
        <View style={style}>
          <Text className='text-sm text-neutral-400'>
            {t("item_card.download.decision_failed")}
          </Text>
        </View>
      );
    }
    if (only.decision?.kind === "direct") {
      return (
        <View style={style}>
          <Text className='text-sm text-green-400'>
            {t("item_card.download.decision_direct")}
          </Text>
        </View>
      );
    }
    if (only.decision?.kind === "transcode") {
      return (
        <View style={style}>
          <Text className='text-sm text-yellow-400'>
            {t("item_card.download.decision_transcode", {
              reasons: reasonsOf(t, only),
            })}
          </Text>
        </View>
      );
    }
    return (
      <View style={style}>
        <Text className='text-sm text-neutral-400'>
          {t("item_card.download.decision_checking")}
        </Text>
      </View>
    );
  }

  if (decisions.checked < decisions.total) {
    return (
      <View style={style}>
        <Text className='text-sm text-neutral-400'>
          {t("item_card.download.decisions_progress", {
            checked: decisions.checked,
            total: decisions.total,
          })}
        </Text>
      </View>
    );
  }

  const notDirect = decisions.items.filter(
    (item) => item.status === "failed" || item.decision?.kind === "transcode",
  );

  return (
    <View style={style}>
      <TouchableOpacity
        disabled={notDirect.length === 0}
        onPress={() => setExpanded((open) => !open)}
      >
        <View className='flex flex-row items-center'>
          <Text
            className={`text-sm ${decisions.transcode > 0 ? "text-yellow-400" : "text-green-400"}`}
          >
            {t("item_card.download.decisions_summary", {
              direct: decisions.direct,
              transcode: decisions.transcode,
            })}
          </Text>
          {notDirect.length > 0 && (
            <Text className='text-sm text-neutral-400 ml-2'>
              {expanded ? "▾" : "›"}
            </Text>
          )}
        </View>
        {decisions.failed > 0 && (
          <Text className='text-sm text-neutral-400'>
            {t("item_card.download.decisions_failed", {
              failed: decisions.failed,
            })}
          </Text>
        )}
      </TouchableOpacity>
      {expanded &&
        notDirect.map((item) => (
          <Text
            key={item.item.Id ?? itemLabel(item.item)}
            className='text-xs text-neutral-300 mt-1'
          >
            {`${itemLabel(item.item)}  ${
              item.status === "failed"
                ? t("item_card.download.decision_failed")
                : reasonsOf(t, item)
            }`}
          </Text>
        ))}
    </View>
  );
}
