import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  QueryClient,
  type QueryKey,
  QueryObserver,
} from "@tanstack/react-query";
import {
  findRefetchingItemQueries,
  patchCachedItemUserData,
  revertCachedItemUserData,
} from "./patchCachedItem";

const season = (likes: boolean): BaseItemDto => ({
  Id: "s1",
  Type: "Season",
  UserData: { Likes: likes, Played: false },
});

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
});

test("patches the item in its own query, a list, and infinite pages", () => {
  client.setQueryData(["item", "s1"], season(true));
  client.setQueryData(["seasons", "show"], [season(true)]);
  client.setQueryData(["see-all"], {
    pages: [{ Items: [season(true)], TotalRecordCount: 1 }],
    pageParams: [0],
  });

  patchCachedItemUserData(client, "s1", { Likes: false });

  expect(client.getQueryData<BaseItemDto>(["item", "s1"])?.UserData).toEqual({
    Likes: false,
    Played: false,
  });
  expect(
    client.getQueryData<BaseItemDto[]>(["seasons", "show"])?.[0].UserData
      ?.Likes,
  ).toBe(false);
  expect(
    client.getQueryData<{ pages: { Items: BaseItemDto[] }[] }>(["see-all"])
      ?.pages[0].Items[0].UserData?.Likes,
  ).toBe(false);
});

// A new reference re-renders every observer of that query.
test("leaves queries without the item, or already up to date, untouched", () => {
  const other = [{ Id: "s2", UserData: { Likes: true } }];
  const current = [season(false)];
  client.setQueryData(["other"], other);
  client.setQueryData(["current"], current);

  const previous = patchCachedItemUserData(client, "s1", { Likes: false });

  expect(previous).toEqual([]);
  expect(client.getQueryData(["other"])).toBe(other);
  expect(client.getQueryData(["current"])).toBe(current);
});

// Restoring whole queries also undid every other item changed in them since.
test("a rollback puts back only the item's field, and the rest of the list stays as it is now", () => {
  const other: BaseItemDto = {
    Id: "s2",
    Type: "Season",
    UserData: { Likes: false },
  };
  client.setQueryData(["seasons", "show"], [season(true), other]);

  const previous = patchCachedItemUserData(client, "s1", { Likes: false });
  patchCachedItemUserData(client, "s2", { Likes: true });
  revertCachedItemUserData(client, "s1", previous);

  expect(
    client
      .getQueryData<BaseItemDto[]>(["seasons", "show"])
      ?.map((item) => item.UserData?.Likes),
  ).toEqual([true, true]);
});

// An item never rated carries no Likes; a rollback must not leave one behind.
test("a rollback removes a field the item never had", () => {
  client.setQueryData(["item", "m1"], {
    Id: "m1",
    UserData: { Played: false },
  });

  const previous = patchCachedItemUserData(client, "m1", { Likes: true });
  revertCachedItemUserData(client, "m1", previous);

  expect(
    client.getQueryData<BaseItemDto>(["item", "m1"])?.UserData,
  ).toStrictEqual({ Played: false });
});

/** Shows a cached row the way a screen mounts it; true when that refetches. */
const refetchesWhenShown = (queryKey: QueryKey, staleTime: number) => {
  const fetchRow = jest.fn(async () => [season(false)]);
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn: fetchRow,
    staleTime,
  });
  observer.subscribe(() => {})();
  return fetchRow.mock.calls.length > 0;
};

// A similar-items row never goes stale by itself: only a played change marks
// it for a refetch. A patch written as fresh data cleared that mark, and the
// row kept the old played state the next time it was shown.
test("a row invalidated before the patch still refetches when shown again", async () => {
  client.setQueryData(["similarItems", "x"], [season(true)]);
  await client.invalidateQueries({ queryKey: ["similarItems"] });

  patchCachedItemUserData(client, "s1", { Likes: false });

  expect(refetchesWhenShown(["similarItems", "x"], Infinity)).toBe(true);
});

// Only the patched field is new; the rest of the row is as old as it was.
test("a row past its stale time still refetches when shown again", () => {
  const staleTime = 5 * 60_000;
  client.setQueryData(["home", "row"], [season(true)], {
    updatedAt: Date.now() - 2 * staleTime,
  });

  patchCachedItemUserData(client, "s1", { Likes: false });

  expect(refetchesWhenShown(["home", "row"], staleTime)).toBe(true);
});

// What a toggle cancels before patching: a refetch landing afterwards would
// write the old value back. An idle query has nothing to cancel.
test("finds the queries holding the item that are fetching, and no others", () => {
  const never = () => new Promise<never>(() => {});
  client.setQueryData(["refetching"], [season(true)]);
  client.setQueryData(["idle"], [season(true)]);
  client.setQueryData(["other"], [{ Id: "s2", UserData: { Likes: true } }]);
  void client.prefetchQuery({ queryKey: ["refetching"], queryFn: never });
  void client.prefetchQuery({ queryKey: ["other"], queryFn: never });

  expect(
    findRefetchingItemQueries(client, "s1").map((query) => query.queryKey),
  ).toEqual([["refetching"]]);
});
