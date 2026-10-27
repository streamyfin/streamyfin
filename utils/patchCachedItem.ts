import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

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

/**
 * Writes `userData` into every cached copy of an item, wherever it sits: its
 * own query, and every list, page or row that holds it. Patching only the
 * item's own query left the lists stale, and a toggle mounted from a list
 * later read the old value back.
 *
 * Unchanged branches keep their identity, so queries that never held the
 * item are not touched and nothing re-renders for them.
 *
 * @returns each changed query with its data from before, for a rollback.
 */
export const patchCachedItemUserData = (
  queryClient: QueryClient,
  itemId: string,
  userData: Partial<UserData>,
): Array<[QueryKey, unknown]> => {
  const previous: Array<[QueryKey, unknown]> = [];
  for (const query of queryClient.getQueryCache().getAll()) {
    const data = query.state.data;
    const next = patch(data, itemId, userData, 0);
    if (next === data) continue;
    previous.push([query.queryKey, data]);
    queryClient.setQueryData(query.queryKey, next);
  }
  return previous;
};
