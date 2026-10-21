import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { Query, QueryClient } from "@tanstack/react-query";

type UserData = NonNullable<BaseItemDto["UserData"]>;

/**
 * One query a patch changed, by its hash, with the item's values there from
 * before.
 */
export type CachedItemPatch = [queryHash: string, previous: Partial<UserData>];

// Item lists sit at most a few levels down: pages -> { Items } -> item.
const MAX_DEPTH = 6;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// An undefined value removes the field, so a rollback can put back a field the
// item never had (Likes on an item never rated).
const merge = (current: UserData, userData: Partial<UserData>): UserData => {
  const merged: Record<string, unknown> = { ...current, ...userData };
  for (const [key, v] of Object.entries(userData)) {
    if (v === undefined) delete merged[key];
  }
  return merged as UserData;
};

/**
 * Returns `value` with `userData` written into each copy of the item, and
 * notes in `found` the item's values from before, taken from the first copy
 * it changed. `found.previous` stays unset exactly when `value` is returned
 * as it was.
 */
const patch = (
  value: unknown,
  itemId: string,
  userData: Partial<UserData>,
  depth: number,
  found: { previous?: Partial<UserData> } = {},
): unknown => {
  if (depth > MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const patched = patch(entry, itemId, userData, depth + 1, found);
      if (patched !== entry) changed = true;
      return patched;
    });
    return changed ? next : value;
  }

  // Class instances (axios headers, dates) are never item containers.
  if (!isPlainObject(value)) return value;

  if (value.Id === itemId) {
    const current = (value.UserData ?? {}) as UserData;
    const keys = Object.keys(userData) as (keyof UserData)[];
    if (keys.every((key) => current[key] === userData[key])) return value;
    found.previous ??= Object.fromEntries(
      keys.map((key) => [key, current[key]]),
    );
    return { ...value, UserData: merge(current, userData) };
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const patched = patch(entry, itemId, userData, depth + 1, found);
    if (patched !== entry) changed = true;
    next[key] = patched;
  }
  return changed ? next : value;
};

/** Whether `value` holds a copy of the item, as deep as `patch` looks. */
const holds = (value: unknown, itemId: string, depth: number): boolean => {
  if (depth > MAX_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => holds(entry, itemId, depth + 1));
  }
  if (!isPlainObject(value)) return false;
  if (value.Id === itemId) return true;
  return Object.values(value).some((entry) => holds(entry, itemId, depth + 1));
};

/**
 * Every cached query whose data holds a copy of the item. A read-only scan
 * that stops at the first copy: running `patch` over the whole persisted cache
 * would copy every object in it to find the few queries a toggle changes.
 */
const findCachedItemQueries = (
  queryClient: QueryClient,
  itemId: string,
): Query[] =>
  queryClient
    .getQueryCache()
    .findAll({ predicate: (query) => holds(query.state.data, itemId, 0) });

/**
 * The cached queries holding the item that are fetching right now: one that
 * lands after a patch writes the item's old values back. Only fetching
 * queries have their data scanned, so this costs next to nothing.
 */
export const findRefetchingItemQueries = (
  queryClient: QueryClient,
  itemId: string,
): Query[] =>
  queryClient.getQueryCache().findAll({
    predicate: (query) =>
      query.state.fetchStatus !== "idle" && holds(query.state.data, itemId, 0),
  });

/**
 * A patch is not a fetch: only the patched field is new, the rest of the data
 * is as old as it was. Written as fresh data, it cleared an invalidated row's
 * mark (a similar-items row never goes stale by itself) and the row kept its
 * old played state the next time it was shown.
 */
const writeKeepingFreshness = (
  queryClient: QueryClient,
  query: Query,
  data: unknown,
) => {
  const { dataUpdatedAt, isInvalidated } = query.state;
  queryClient.setQueryData(query.queryKey, data, { updatedAt: dataUpdatedAt });
  // On the query itself: a key filter would walk the whole cache to find it.
  if (isInvalidated) query.invalidate();
};

/**
 * Writes `userData` into every cached copy of an item, wherever it sits: its
 * own query, and every list, page or row that holds it. Patching only the
 * item's own query left the lists stale, and a toggle mounted from a list
 * later read the old value back.
 *
 * Only queries holding the item are written, each keeping how fresh it was;
 * unchanged branches keep their identity, so nothing else re-renders.
 *
 * @param queries the queries to write, every query holding the item when
 * omitted.
 * @returns each changed query with the item's values there from before, for
 * `revertCachedItemUserData`.
 */
export const patchCachedItemUserData = (
  queryClient: QueryClient,
  itemId: string,
  userData: Partial<UserData>,
  queries: Query[] = findCachedItemQueries(queryClient, itemId),
): CachedItemPatch[] => {
  const patches: CachedItemPatch[] = [];
  for (const query of queries) {
    const found: { previous?: Partial<UserData> } = {};
    const next = patch(query.state.data, itemId, userData, 0, found);
    if (!found.previous) continue;
    patches.push([query.queryHash, found.previous]);
    writeKeepingFreshness(queryClient, query, next);
  }
  return patches;
};

/**
 * Puts back what `patchCachedItemUserData` changed, field by field. Restoring
 * whole queries also undid every other item changed in them meanwhile, such
 * as a second season toggled while the first request was pending.
 */
export const revertCachedItemUserData = (
  queryClient: QueryClient,
  itemId: string,
  patches: CachedItemPatch[],
) => {
  for (const [queryHash, previous] of patches) {
    const query = queryClient.getQueryCache().get(queryHash);
    if (!query) continue;
    const data = query.state.data;
    const next = patch(data, itemId, previous, 0);
    if (next !== data) writeKeepingFreshness(queryClient, query, next);
  }
};
