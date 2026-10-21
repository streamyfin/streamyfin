import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { Query, QueryClient, QueryKey } from "@tanstack/react-query";

type UserData = NonNullable<BaseItemDto["UserData"]>;

// Item lists sit at most a few levels down: pages -> { Items } -> item.
const MAX_DEPTH = 6;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const patch = (
  value: unknown,
  itemId: string,
  userData: Partial<UserData>,
  depth: number,
): unknown => {
  if (depth > MAX_DEPTH) return value;

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const patched = patch(entry, itemId, userData, depth + 1);
      if (patched !== entry) changed = true;
      return patched;
    });
    return changed ? next : value;
  }

  // Class instances (axios headers, dates) are never item containers.
  if (!isPlainObject(value)) return value;

  if (value.Id === itemId) {
    const current = (value.UserData ?? {}) as UserData;
    const differs = Object.entries(userData).some(
      ([key, v]) => current[key as keyof UserData] !== v,
    );
    return differs
      ? { ...value, UserData: { ...current, ...userData } }
      : value;
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const patched = patch(entry, itemId, userData, depth + 1);
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
  if (isInvalidated) {
    queryClient.invalidateQueries({
      queryKey: query.queryKey,
      exact: true,
      refetchType: "none",
    });
  }
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
 * @returns each changed query with its data from before, for a rollback.
 */
export const patchCachedItemUserData = (
  queryClient: QueryClient,
  itemId: string,
  userData: Partial<UserData>,
): Array<[QueryKey, unknown]> => {
  const previous: Array<[QueryKey, unknown]> = [];
  for (const query of findCachedItemQueries(queryClient, itemId)) {
    const data = query.state.data;
    const next = patch(data, itemId, userData, 0);
    if (next === data) continue;
    previous.push([query.queryKey, data]);
    writeKeepingFreshness(queryClient, query, next);
  }
  return previous;
};
