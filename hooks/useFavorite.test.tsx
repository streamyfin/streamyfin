import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type React from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useFavorite } from "./useFavorite";

jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "u" }) };
});

const store = getDefaultStore();
const movie = {
  Id: "m1",
  Type: "Movie" as const,
  UserData: { IsFavorite: true },
};

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

/** An api whose favorite requests stay open until `fail` is called. */
const pendingApi = () => {
  let fail: (error: Error) => void = () => {};
  const pending = () =>
    new Promise((_resolve, reject) => {
      fail = reject;
    });
  return {
    api: { post: jest.fn(pending), delete: jest.fn(pending) },
    fail: (error: Error) =>
      act(async () => {
        fail(error);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
  };
};

beforeEach(() => {
  store.set(userAtom, { Id: "u" } as never);
});

test("removes a favorite with the web client's endpoint", async () => {
  const { api } = pendingApi();
  store.set(apiAtom, api as never);
  const { result } = await renderHook(() => useFavorite(movie), {
    wrapper: wrapperFor(newClient()),
  });

  await act(async () => result.current.toggleFavorite());

  expect(api.delete).toHaveBeenCalledWith("/Users/u/FavoriteItems/m1", {});
});

// Logging out clears the cache and unmounts the page, but a request already
// sent still settles. Its rollback must not put the first account's item back
// into the cache the next account reads.
test("does not roll back into the cache after the account changed", async () => {
  const { api, fail } = pendingApi();
  store.set(apiAtom, api as never);
  const client = newClient();
  client.setQueryData(["item", "m1"], movie);
  const view = await renderHook(() => useFavorite(movie), {
    wrapper: wrapperFor(client),
  });
  await act(async () => view.result.current.toggleFavorite());

  await view.unmount();
  client.clear();
  store.set(userAtom, { Id: "someone-else" } as never);
  const nextAccountsCopy = {
    Id: "m1",
    Name: "second account's copy",
    UserData: { IsFavorite: false },
  };
  client.setQueryData(["item", "m1"], nextAccountsCopy);

  await fail(new Error("server said no"));

  expect(client.getQueryData(["item", "m1"])).toEqual(nextAccountsCopy);
});
