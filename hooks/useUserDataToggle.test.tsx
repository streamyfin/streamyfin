import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
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

/** Settles one open request, then lets the mutation callbacks run. */
const settle = (index: number, outcome: "succeed" | "fail") =>
  act(async () => {
    const request = requests[index];
    if (outcome === "succeed") request.succeed();
    else request.fail(new Error("server said no"));
    await new Promise((resolve) => setTimeout(resolve, 0));
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
 * the way SeasonPicker hands its selected season to the bookmark.
 */
const renderSeasonToggle = (client: QueryClient, index: number) =>
  renderHook(
    () => {
      const { data } = useQuery<BaseItemDto[]>({
        queryKey: ["seasons", "show"],
        queryFn: async () => [],
        staleTime: Infinity,
      });
      return useUserDataToggle({
        item: data![index],
        field: "Likes",
        stateAtom,
        send,
        errorMessage: "failed",
      });
    },
    { wrapper: wrapperFor(client) },
  );

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
