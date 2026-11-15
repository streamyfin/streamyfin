import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { TV_CAST_CARD_LIMIT, TV_CAST_KINDS } from "@/constants/CastCrew";
import { type CastCrewPerson, useCastCrew } from "@/hooks/useCastCrew";

/** Item types whose TV page draws the cast as cards. */
const TYPES_WITH_CAST_CARDS = new Set(["Movie", "Series", "Episode"]);

/**
 * The cast of a TV item page. `cards` holds one entry per person, so an actor
 * credited for two roles is one card and its `Id` is a safe key: listed once
 * per role, the same actor gave two cards with one key. `castInText` says
 * whether the credits text line names the cast instead, which it does only
 * when there are no cards. Covered by useTVCast.test.tsx.
 */
export const useTVCast = (
  item: BaseItemDto | null | undefined,
): { cards: CastCrewPerson[]; castInText: boolean } => {
  const cast = useCastCrew(item?.People, {
    kinds: TV_CAST_KINDS,
    limit: TV_CAST_CARD_LIMIT,
  });
  const showCards =
    TYPES_WITH_CAST_CARDS.has(item?.Type ?? "") && cast.length > 0;
  return { cards: showCards ? cast : [], castInText: !showCards };
};
