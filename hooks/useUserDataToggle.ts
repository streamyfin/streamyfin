import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { patchCachedItemUserData } from "@/utils/patchCachedItem";

/** A boolean on the item's UserData that the user flips with one request. */
export type ToggleField = "IsFavorite" | "Likes";

/** Shared toggle state, keyed by `toggleStateKey`. */
export type ToggleStateAtom = PrimitiveAtom<Record<string, boolean>>;

export const toggleStateKey = (userId: string, itemId: string) =>
  `${userId}:${itemId}`;

interface Options {
  item: BaseItemDto;
  field: ToggleField;
  stateAtom: ToggleStateAtom;
  /** Sends the new value to the server. */
  send: (
    api: Api,
    userId: string,
    itemId: string,
    next: boolean,
  ) => Promise<unknown>;
  /** Queries to refetch once the request settles, beyond the item's own. */
  invalidate?: QueryKey[];
  /** Shown when the request fails; nothing is shown without one. */
  errorMessage?: string;
  /**
   * False while the toggle cannot be offered. The hook then stays passive:
   * a list mounts one per card, and every write to the shared atom is work
   * for all of them.
   */
  enabled?: boolean;
}

/**
 * An optimistic toggle of one UserData boolean, shared by every mounted toggle
 * of the same item: flipping it in one place updates the others at once, and a
 * failed request puts every copy back.
 */
export const useUserDataToggle = ({
  item,
  field,
  stateAtom,
  send,
  invalidate = [],
  errorMessage,
  enabled = true,
}: Options) => {
  const queryClient = useQueryClient();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const setState = useSetAtom(stateAtom);

  const key = user?.Id && item.Id ? toggleStateKey(user.Id, item.Id) : "";

  // Subscribe to this item's entry only, so one card's write does not
  // re-render every other card on screen.
  const stored = useAtomValue(
    useMemo(
      () => selectAtom(stateAtom, (state) => (key ? state[key] : undefined)),
      [stateAtom, key],
    ),
  );
  const fromItem = item.UserData?.[field] ?? undefined;
  const value = stored ?? fromItem;

  // The cache is patched on every toggle, so a fresh copy of the item carries
  // the newest value and may overwrite the shared entry.
  useEffect(() => {
    if (!enabled || !key || typeof fromItem !== "boolean") return;
    setState((prev) =>
      prev[key] === fromItem ? prev : { ...prev, [key]: fromItem },
    );
  }, [enabled, key, fromItem, setState]);

  const setValue = useCallback(
    (next: boolean | undefined) => {
      if (!key || next === undefined) return;
      setState((prev) => ({ ...prev, [key]: next }));
    },
    [key, setState],
  );

  // The mutation runs after renders that may have swapped the api or user.
  const latest = useRef({ api, userId: user?.Id, itemId: item.Id });
  useEffect(() => {
    latest.current = { api, userId: user?.Id, itemId: item.Id };
  }, [api, user?.Id, item.Id]);

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { api, userId, itemId } = latest.current;
      if (!api || !userId || !itemId) {
        throw new Error("Not signed in");
      }
      await send(api, userId, itemId, next);
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["item", item.Id] });
      const previousValue = value;
      const previousQueries = item.Id
        ? patchCachedItemUserData(queryClient, item.Id, { [field]: next })
        : [];
      setValue(next);
      return { previousValue, previousQueries };
    },
    onError: (_error, _next, context) => {
      for (const [queryKey, data] of context?.previousQueries ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
      setValue(context?.previousValue);
      if (errorMessage) toast.error(errorMessage);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["item", item.Id] });
      for (const queryKey of invalidate) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const toggle = useCallback(() => {
    // Overlapping requests could land out of order and leave the server's
    // value out of step with the UI.
    if (mutation.isPending) return;
    mutation.mutate(!value);
  }, [mutation, value]);

  return { value, toggle, isPending: mutation.isPending, mutation };
};
