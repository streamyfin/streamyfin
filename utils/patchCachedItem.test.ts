import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient } from "@tanstack/react-query";
import { patchCachedItemUserData } from "./patchCachedItem";

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

test("returns what each changed query held, for a rollback", () => {
  const before = [season(true)];
  client.setQueryData(["seasons", "show"], before);

  const previous = patchCachedItemUserData(client, "s1", { Likes: false });

  expect(previous).toEqual([[["seasons", "show"], before]]);
});
