import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  type InvalidateQueryFilters,
  partialMatchKey,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type PrimitiveAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  findRefetchingItemQueries,
  patchCachedItemUserData,
  revertCachedItemUserData,
} from "@/utils/patchCachedItem";

/** A boolean on the item's UserData that the user flips with one request. */
export type ToggleField = "IsFavorite" | "Likes";

/** Shared toggle state, keyed by `toggleStateKey`. */
export type ToggleStateAtom = PrimitiveAtom<Record<string, boolean>>;

export const toggleStateKey = (userId: string, itemId: string) =>
  `${userId}:${itemId}`;

/** One toggle request: the item it is for, and the value it sends. */
type ToggleRequest = { itemId: string; next: boolean };

// Marks a toggle's request in the mutation cache. Not a mutationKey:
// reportDataError groups failed requests by their key.
const TOGGLE_META = { userDataToggle: true };

/**
 * Per query client, the queries settled toggles interrupted, by query hash,
 * waiting for the last toggle in flight to settle.
 */
const interruptedWaiting = new WeakMap<QueryClient, Map<string, QueryKey>>();

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
  invalidate?: InvalidateQueryFilters[];
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
  const store = useStore();
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

  // Every cached copy of the item is patched on each toggle and prune, so a
  // copy read from any list carries the newest value and may overwrite the
  // shared entry.
  useEffect(() => {
    if (!enabled || !key || typeof fromItem !== "boolean") return;
    setState((prev) =>
      prev[key] === fromItem ? prev : { ...prev, [key]: fromItem },
    );
  }, [enabled, key, fromItem, setState]);

  // Undefined forgets the entry, so the item's own value shows again: an item
  // never rated must read as unrated after its first toggle fails.
  const writeEntry = useCallback(
    (entryKey: string, next: boolean | undefined) => {
      if (!entryKey) return;
      setState((prev) => {
        if (next !== undefined) return { ...prev, [entryKey]: next };
        if (!(entryKey in prev)) return prev;
        const rest = { ...prev };
        delete rest[entryKey];
        return rest;
      });
    },
    [setState],
  );

  // The mutation runs after renders that may have swapped the api or user.
  const latest = useRef({ api, userId: user?.Id });
  useEffect(() => {
    latest.current = { api, userId: user?.Id };
  }, [api, user?.Id]);

  // The items with a request sent and not settled yet. Unlike
  // `mutation.isPending`, which only changes after a re-render, it already
  // holds an item for a second tap landing before that render. Keyed by item:
  // a host may hand this toggle the next item (the now-playing heart follows
  // the queue) while the previous item's request is still open.
  const inFlight = useRef(new Set<string>());

  // Each request names its item and works from what it captured. A pending
  // mutation takes the callbacks of every later render, so by the time it runs
  // or settles they may close over the next item the host handed this toggle.
  const mutation = useMutation({
    meta: TOGGLE_META,
    mutationFn: async ({ itemId, next }: ToggleRequest) => {
      const { api, userId } = latest.current;
      if (!api || !userId || !itemId) {
        throw new Error("Not signed in");
      }
      await send(api, userId, itemId, next);
    },
    onMutate: async ({ itemId, next }: ToggleRequest) => {
      const userId = store.get(userAtom)?.Id;
      const entryKey = userId && itemId ? toggleStateKey(userId, itemId) : "";
      const previousEntry = entryKey
        ? store.get(stateAtom)[entryKey]
        : undefined;
      // Any query holding the item may be refetching it, and a refetch landing
      // after the patch writes the old value back into every toggle reading
      // it (SeasonPicker's season list goes stale after 60 ms). Cancel them
      // all before patching; the interrupted ones are fetched again once the
      // last toggle in flight settles. The item's own queries are cancelled
      // whatever they hold: one on its first load has no copy yet for the
      // scan to find, and every settle fetches them again anyway.
      const fetching = itemId
        ? findRefetchingItemQueries(queryClient, itemId)
        : [];
      // A next or previous page on its way is let through: cancelled, it was
      // dropped, and a grid that asks again only once its content grows (the
      // TV collection grid) stopped paging. It lands with the pages as they
      // were before the patch, so the patch is written into it again then.
      const paging = fetching.filter(
        (query) => query.state.fetchMeta?.fetchMore,
      );
      const interrupted = fetching.filter((query) => !paging.includes(query));
      const itemKey = ["item", itemId];
      await queryClient.cancelQueries({
        predicate: (query) =>
          interrupted.includes(query) ||
          partialMatchKey(query.queryKey, itemKey),
      });
      const userData = { [field]: next };
      const patches = itemId
        ? patchCachedItemUserData(queryClient, itemId, userData)
        : [];
      const outcome = { failed: false };
      for (const query of paging) {
        void query.promise?.then(
          () => {
            if (outcome.failed) return;
            patchCachedItemUserData(queryClient, itemId, userData, [query]);
          },
          () => {},
        );
      }
      writeEntry(entryKey, next);
      return {
        entryKey,
        previousEntry,
        patches,
        interrupted: interrupted.map(
          (query) => [query.queryHash, query.queryKey] as const,
        ),
        outcome,
        userId,
      };
    },
    onError: (_error, { itemId }, context) => {
      // A page still on its way lands with the item as it was before the
      // toggle, which is what the server kept: it is not patched again.
      if (context) context.outcome.failed = true;
      // The item queries are not keyed by account, so a request that fails
      // after a logout or user switch must not write its rollback into the
      // next account's cache. Read the store, not `latest`: the page that sent
      // the request has usually unmounted by then, freezing the ref.
      if (!context || store.get(userAtom)?.Id !== context.userId) return;

      revertCachedItemUserData(queryClient, itemId, context.patches);
      writeEntry(context.entryKey, context.previousEntry);
      if (errorMessage) toast.error(errorMessage);
    },
    onSettled: (_data, _error, request, context) => {
      inFlight.current.delete(request.itemId);
      queryClient.invalidateQueries({ queryKey: ["item", request.itemId] });
      for (const filters of invalidate) {
        queryClient.invalidateQueries(filters);
      }
      const waiting =
        interruptedWaiting.get(queryClient) ?? new Map<string, QueryKey>();
      for (const [queryHash, queryKey] of context?.interrupted ?? []) {
        waiting.set(queryHash, queryKey);
      }
      // Another toggle in flight may have patched its item into the same
      // queries: fetched now, they could read the server before that request
      // lands, and its own settle would not fetch them again. The last toggle
      // to settle fetches them all. Read the mutation cache rather than count:
      // a request paused offline and dropped on logout never settles.
      const othersInFlight = queryClient.isMutating({
        predicate: (other) =>
          other.options.meta === TOGGLE_META &&
          other.state.variables !== request,
      });
      if (othersInFlight > 0) {
        interruptedWaiting.set(queryClient, waiting);
        return;
      }
      interruptedWaiting.delete(queryClient);
      // Last, and without cancelling a refetch already started above, so a
      // query both interrupted and refreshed anyway is fetched once.
      for (const queryKey of waiting.values()) {
        queryClient.invalidateQueries(
          { queryKey, exact: true },
          { cancelRefetch: false },
        );
      }
    },
  });

  const toggle = useCallback(() => {
    const itemId = item.Id ?? "";
    // Overlapping requests for one item could land out of order and leave
    // the server's value out of step with the UI.
    if (inFlight.current.has(itemId)) return;
    inFlight.current.add(itemId);
    mutation.mutate({ itemId, next: !value });
  }, [item.Id, mutation, value]);

  return { value, toggle, isPending: mutation.isPending, mutation };
};
