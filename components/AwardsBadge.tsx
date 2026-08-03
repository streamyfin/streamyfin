import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Platform, type ViewProps } from "react-native";
import { useWikidataAwards } from "@/hooks/useWikidataAwards";
import { Badge } from "./Badge";

/**
 * A single badge summarising a title's awards.
 *
 * Oscars lead when there are any, because that is the thing worth spotting at a
 * glance; otherwise it falls back to the overall wins/nominations tally.
 */
export const AwardsBadge: React.FC<
  ViewProps & { item?: BaseItemDto | null }
> = ({ item, ...props }) => {
  const { t } = useTranslation();
  const awards = useWikidataAwards(item);

  if (!awards) return null;

  const { wins, nominations, oscarWins, oscarNominations } = awards;

  let text: string;
  if (oscarWins > 0) {
    text = t(oscarWins === 1 ? "awards.won_oscar" : "awards.won_oscars", {
      count: oscarWins,
    });
  } else if (oscarNominations > 0) {
    text = t(
      oscarNominations === 1
        ? "awards.nominated_for_oscar"
        : "awards.nominated_for_oscars",
      { count: oscarNominations },
    );
  } else {
    const winText =
      wins > 0
        ? t(wins === 1 ? "awards.win" : "awards.wins", { count: wins })
        : null;
    const nominationText =
      nominations > 0
        ? t(nominations === 1 ? "awards.nomination" : "awards.nominations", {
            count: nominations,
          })
        : null;

    if (winText && nominationText) {
      text = t("awards.wins_and_nominations", {
        wins: winText,
        nominations: nominationText,
      });
    } else if (winText ?? nominationText) {
      text = (winText ?? nominationText) as string;
    } else {
      return null;
    }
  }

  return (
    <Badge
      {...props}
      text={text}
      variant='gray'
      iconLeft={
        // Match the star on the rating badge sitting next to it.
        <Ionicons
          name='trophy'
          size={Platform.isTV ? 16 : 13}
          color='#e0b34a'
        />
      }
    />
  );
};

export default AwardsBadge;
