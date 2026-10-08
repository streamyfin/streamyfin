import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { useVersionItem, useVersionItemState } from "./useVersionItem";

let mockServerVersion = "12.0.0";
let mockOffline = false;
const mockGetItem = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getSystemApi: () => ({
    getPublicSystemInfo: async () => ({
      data: { Version: mockServerVersion },
    }),
  }),
  getUserLibraryApi: () => ({ getItem: mockGetItem }),
}));

const primary: BaseItemDto = {
  Id: "primary",
  Type: "Movie",
  UserData: { PlaybackPositionTicks: 100, Played: false },
};
const alternate: BaseItemDto = {
  Id: "alt",
  Type: "Movie",
  UserData: { PlaybackPositionTicks: 900, Played: false },
};

const versions = [{ Id: "primary" }, { Id: "alt" }];

const render = async (mediaSourceId: string) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const { result } = await renderHook(
    () => useVersionItem(primary, versions, mediaSourceId),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={createStore()}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  return { result, client };
};

beforeEach(() => {
  mockServerVersion = "12.0.0";
  mockOffline = false;
  mockGetItem.mockReset();
  mockGetItem.mockResolvedValue({ data: alternate });
});

test("reads the selected version's UserData on Jellyfin 12", async () => {
  const { result } = await render("alt");
  // The primary item stands in until the version item arrives.
  expect(result.current).toBe(primary);
  await waitFor(() => expect(result.current).toEqual(alternate));
  expect(mockGetItem).toHaveBeenCalledWith({ itemId: "alt", userId: "user-1" });
});

// Until the version item is in, the primary's resume point stands in for it.
// Pressing Play in that moment started the alternate cut at a position that
// belongs to another version, so the page has to know it is still waiting.
test("says the version item is on its way, and when it has arrived", async () => {
  let deliver: (response: { data: BaseItemDto }) => void = () => {};
  mockGetItem.mockReturnValue(
    new Promise((resolve) => {
      deliver = resolve;
    }),
  );
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const { result } = await renderHook(
    () => useVersionItemState(primary, versions, "alt"),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={createStore()}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );

  await waitFor(() => expect(result.current.isPending).toBe(true));
  expect(result.current.versionItem).toBe(primary);

  await act(async () => deliver({ data: alternate }));

  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(result.current.versionItem).toEqual(alternate);
});

test("is not waiting when the primary version is selected", async () => {
  const { result } = await renderHook(
    () => useVersionItemState(primary, versions, "primary"),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider
          client={
            new QueryClient({
              defaultOptions: {
                queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
              },
            })
          }
        >
          <JotaiProvider store={createStore()}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(result.current).toEqual({ versionItem: primary, isPending: false });
  expect(mockGetItem).not.toHaveBeenCalled();
});

// A failed request is not a wait: the primary's data is all there is, and
// Play must not stay locked behind it.
test("stops waiting when the version item cannot be fetched", async () => {
  mockGetItem.mockRejectedValue(new Error("offline"));
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const { result } = await renderHook(
    () => useVersionItemState(primary, versions, "alt"),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={createStore()}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );

  await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
  await waitFor(() => expect(result.current.isPending).toBe(false));
  expect(result.current.versionItem).toBe(primary);
});

test("keeps the item's own UserData before Jellyfin 12", async () => {
  mockServerVersion = "10.11.0";
  const { result } = await render("alt");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(result.current).toBe(primary);
  expect(mockGetItem).not.toHaveBeenCalled();
});

test("the played toggle's optimistic update reaches the version item", async () => {
  // useMarkAsPlayed patches every ["item", id] query; the version item lives
  // under that prefix so the toggle shows at once.
  const { result, client } = await render("alt");
  await waitFor(() => expect(result.current).toEqual(alternate));
  await act(async () => {
    client.setQueriesData<BaseItemDto>({ queryKey: ["item", "alt"] }, (old) =>
      old ? { ...old, UserData: { ...old.UserData, Played: true } } : old,
    );
  });
  await waitFor(() => expect(result.current?.UserData?.Played).toBe(true));
});
