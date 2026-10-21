import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type InvalidateQueryFilters,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { atom, getDefaultStore } from "jotai";
import type React from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { type ToggleStateAtom, useUserDataToggle } from "./useUserDataToggle";

jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "u" }) };
});

/** One rating request, open until the test settles it. */
type Request = {
  itemId: string;
  next: boolean;
  succeed: () => void;
  fail: (error: Error) => void;
};

let requests: Request[] = [];
const send = jest.fn(
  (_api: unknown, _userId: string, itemId: string, next: boolean) =>
    new Promise<void>((resolve, reject) => {
      requests.push({ itemId, next, succeed: () => resolve(), fail: reject });
    }),
);

/** Lets settled promises run their callbacks and React Query notify. */
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** Settles one open request, then lets the mutation callbacks run. */
const settle = (index: number, outcome: "succeed" | "fail") =>
  act(async () => {
    const request = requests[index];
    if (outcome === "succeed") request.succeed();
    else request.fail(new Error("server said no"));
    await flush();
  });

// An infinite gcTime schedules no cleanup timer; a settled mutation's default
// five-minute one would keep Jest from exiting.
const newClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

const store = getDefaultStore();
let stateAtom: ToggleStateAtom;

/** A Likes toggle, as the watchlist bookmark mounts it. */
const renderToggle = (item: BaseItemDto, client = newClient()) =>
  renderHook(
    (props: { item: BaseItemDto }) =>
      useUserDataToggle({
        item: props.item,
        field: "Likes",
        stateAtom,
        send,
        errorMessage: "failed",
      }),
    { initialProps: { item }, wrapper: wrapperFor(client) },
  );

const season = (id: string, likes: boolean): BaseItemDto => ({
  Id: id,
  Type: "Season",
  UserData: { Likes: likes },
});

/**
 * A Likes toggle for one season of the cached season list, read from the list
 * the way SeasonPicker hands its selected season to the bookmark. The list
 * stays fresh unless given a fetch and a stale time.
 */
const renderSeasonToggle = (
  client: QueryClient,
  index: number,
  list: {
    fetch?: () => Promise<BaseItemDto[]>;
    staleTime?: number;
    invalidate?: InvalidateQueryFilters[];
  } = {},
) =>
  renderHook(
    () => {
      const { data } = useQuery<BaseItemDto[]>({
        queryKey: ["seasons", "show"],
        queryFn: list.fetch ?? (async () => []),
        staleTime: list.staleTime ?? Infinity,
      });
      return useUserDataToggle({
        item: data![index],
        field: "Likes",
        stateAtom,
        send,
        invalidate: list.invalidate,
        errorMessage: "failed",
      });
    },
    { wrapper: wrapperFor(client) },
  );

/** Season list fetches that wait for the test to answer them, in order. */
const pendingSeasonFetches = () => {
  const answers: Array<(seasons: BaseItemDto[]) => void> = [];
  const fetch = jest.fn(
    () =>
      new Promise<BaseItemDto[]>((resolve) => {
        answers.push(resolve);
      }),
  );
  const answer = (index: number, seasons: BaseItemDto[]) =>
    act(async () => {
      answers[index](seasons);
      await flush();
    });
  return { fetch, answer };
};

beforeEach(() => {
  requests = [];
  send.mockClear();
  stateAtom = atom<Record<string, boolean>>({});
  store.set(apiAtom, {} as never);
  store.set(userAtom, { Id: "u" } as never);
});

// An item never rated carries no Likes at all. A failed first add left the
// shared entry filled: the bookmark stayed on while the server had nothing,
// and the next tap sent likes=false.
test("a failed first rating leaves the item unrated, and the next tap adds it again", async () => {
  const neverRated: BaseItemDto = { Id: "m1", Type: "Movie", UserData: {} };
  const { result } = await renderToggle(neverRated);
  expect(result.current.value).toBeUndefined();

  await act(async () => result.current.toggle());
  expect(result.current.value).toBe(true);
  await settle(0, "fail");

  expect(result.current.value).toBeUndefined();
  await act(async () => result.current.toggle());
  expect(requests.map((request) => request.next)).toEqual([true, true]);
});

// Two seasons of one show share the season list. The first request failed
// after the second toggle had been patched into that list, and restoring the
// whole list as it was before the first toggle undid the second one too: its
// bookmark went empty while the server had it.
test("a failed toggle puts back only its own item in a shared list", async () => {
  const client = newClient();
  client.setQueryData(
    ["seasons", "show"],
    [season("s1", false), season("s2", false)],
  );
  const first = await renderSeasonToggle(client, 0);
  const second = await renderSeasonToggle(client, 1);

  await act(async () => first.result.current.toggle());
  await act(async () => second.result.current.toggle());
  await settle(1, "succeed");
  await settle(0, "fail");

  expect(first.result.current.value).toBe(false);
  expect(second.result.current.value).toBe(true);
});

// SeasonPicker's season list goes stale after 60 ms, so a refetch is often in
// flight when the season bookmark is tapped. Only the item's own query was
// cancelled: the list refetch landed after the patch with the old Likes, and
// the bookmark read from it flipped back while the server had the new value.
test("a list refetch already in flight does not undo the toggle", async () => {
  const client = newClient();
  client.setQueryData(["seasons", "show"], [season("s1", false)]);
  const seasons = pendingSeasonFetches();
  const { result } = await renderSeasonToggle(client, 0, {
    fetch: seasons.fetch,
    staleTime: 0,
  });
  expect(seasons.fetch).toHaveBeenCalledTimes(1);

  await act(async () => result.current.toggle());
  // The server answers with the list as it was before the toggle.
  await seasons.answer(0, [season("s1", false)]);

  expect(result.current.value).toBe(true);
});

// Cancelling that refetch must not lose what it was bringing: the list is
// fetched again once the server has the new value.
test("fetches an interrupted list again once the toggle settles", async () => {
  const client = newClient();
  client.setQueryData(["seasons", "show"], [season("s1", false)]);
  const seasons = pendingSeasonFetches();
  const { result } = await renderSeasonToggle(client, 0, {
    fetch: seasons.fetch,
    staleTime: 0,
  });

  await act(async () => result.current.toggle());
  await settle(0, "succeed");

  expect(seasons.fetch).toHaveBeenCalledTimes(2);
  await seasons.answer(1, [season("s1", true)]);
  expect(result.current.value).toBe(true);
});

// The watchlist refreshes its home rows once a toggle settles anyway; a row it
// also interrupted must not be fetched a second time for that.
test("fetches an interrupted list once when the toggle refreshes it anyway", async () => {
  const client = newClient();
  client.setQueryData(["seasons", "show"], [season("s1", false)]);
  const seasons = pendingSeasonFetches();
  const { result } = await renderSeasonToggle(client, 0, {
    fetch: seasons.fetch,
    staleTime: 0,
    invalidate: [{ queryKey: ["seasons"] }],
  });

  await act(async () => result.current.toggle());
  await settle(0, "succeed");

  expect(seasons.fetch).toHaveBeenCalledTimes(2);
});
