import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { ItemActionSheetHost } from "@/components/common/ItemActionSheetHost";
import {
  getItemNavigation,
  itemRouter,
} from "@/components/common/TouchableItemRouter";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom } from "@/providers/JellyfinProvider";
import { buildItemCards, type CardData, type CardKind } from "./CardData";

type Options = {
  /** Media items — cards are built here, and presses navigate. */
  items?: BaseItemDto[];
  /** Prebuilt cards, for anything that isn't a `BaseItemDto`. */
  cards?: CardData[];
  kind: CardKind;
  useEpisodePoster?: boolean;
  selectedId?: string | null;
  /** Replaces the default navigation (items mode). */
  onPressItem?: (item: BaseItemDto) => void;
  /** Press handler for `cards` mode. */
  onPressId?: (id: string) => void;
  /** Replaces the long-press action sheet (items mode). */
  onLongPressItem?: (item: BaseItemDto) => void;
  /** Long press opens the played/favorite sheet (items mode). */
  enableActionSheet?: boolean;
};

/**
 * Everything a container of cards needs besides its layout: the cards
 * themselves, what a press means, and the long-press action sheet. Kept apart
 * from `CardRow` so another arrangement of the same cards gets all of it free.
 */
export function useItemCardBehavior({
  items,
  cards: providedCards,
  kind,
  useEpisodePoster = false,
  selectedId,
  onPressItem,
  onPressId,
  onLongPressItem,
  enableActionSheet = true,
}: Options) {
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const segments = useSegments();
  const [actionSheetItem, setActionSheetItem] = useState<BaseItemDto | null>(
    null,
  );

  const from = (segments as string[])[2] || "(home)";

  const cards = useMemo(
    () =>
      providedCards ??
      buildItemCards(items ?? [], {
        api,
        kind,
        useEpisodePoster,
        selectedId,
      }),
    [providedCards, items, api, kind, useEpisodePoster, selectedId],
  );

  const handlePress = useCallback(
    (id: string) => {
      if (onPressId) {
        onPressId(id);
        return;
      }

      const item = items?.find((i) => i.Id === id);
      if (!item) return;

      if (onPressItem) {
        onPressItem(item);
        return;
      }

      // Music libraries navigate via the explicit string route so the dynamic
      // [libraryId] param survives the nested navigator.
      if ("CollectionType" in item && item.CollectionType === "music") {
        router.push(itemRouter(item, from) as any);
        return;
      }

      router.push(getItemNavigation(item, from) as any);
    },
    [from, items, onPressId, onPressItem, router],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      const item = items?.find((i) => i.Id === id);
      if (!item) return;

      if (onLongPressItem) {
        onLongPressItem(item);
        return;
      }

      setActionSheetItem(item);
    },
    [items, onLongPressItem],
  );

  const closeActionSheet = useCallback(() => setActionSheetItem(null), []);

  // Only media items have a played/favorite state to act on — but a screen
  // that handles the long press itself always gets it.
  const allowLongPress =
    Boolean(items) && (Boolean(onLongPressItem) || enableActionSheet);

  return {
    cards,
    handlePress,
    handleLongPress: allowLongPress ? handleLongPress : undefined,
    /** Mount alongside the cards; renders nothing until a long press. */
    actionSheet: actionSheetItem ? (
      <ItemActionSheetHost
        key={actionSheetItem.Id}
        item={actionSheetItem}
        onClose={closeActionSheet}
      />
    ) : null,
  };
}
