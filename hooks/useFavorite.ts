import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { atom } from "jotai";
import { type ToggleStateAtom, useUserDataToggle } from "./useUserDataToggle";

// Shared favorite status across all components, keyed by user and item.
const favoritesAtom: ToggleStateAtom = atom<Record<string, boolean>>({});

const INVALIDATE = [{ queryKey: ["home", "favorites"] }];

/**
 * Pass `enabled: false` where the toggle is not offered: every card mounts
 * one, and a passive one writes nothing shared.
 */
export const useFavorite = (
  item: BaseItemDto,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { value, toggle, mutation } = useUserDataToggle({
    item,
    field: "IsFavorite",
    stateAtom: favoritesAtom,
    enabled,
    invalidate: INVALIDATE,
    // Use the same endpoint format as the web client:
    // POST /Users/{userId}/FavoriteItems/{itemId} - add favorite
    // DELETE /Users/{userId}/FavoriteItems/{itemId} - remove favorite
    send: (api, userId, itemId, next) => {
      const path = `/Users/${userId}/FavoriteItems/${itemId}`;
      return next ? api.post(path, {}, {}) : api.delete(path, {});
    },
  });

  return {
    isFavorite: value,
    toggleFavorite: toggle,
    favoriteMutation: mutation,
  };
};
