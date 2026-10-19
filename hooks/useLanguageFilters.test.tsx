import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useLanguageFilters } from "./useLanguageFilters";

let mockApi: ReturnType<typeof makeApi>;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom({ Id: "user-1" }),
  };
});

const MOVIES: BaseItemDto = {
  Id: "movies",
  Type: "CollectionFolder",
  CollectionType: "movies",
};
const MUSIC: BaseItemDto = {
  Id: "music",
  Type: "CollectionFolder",
  CollectionType: "music",
};

const serverRunning = (version: string) => {
  mockApi = makeApi();
  mockApi.mock.onGet(/\/System\/Info\/Public/).reply(200, { Version: version });
  mockApi.mock.onGet(/\/Items\/Filters2/).reply(200, {
    AudioLanguages: [{ Name: "English (eng)", Value: "eng" }],
    SubtitleLanguages: [{ Name: "Swedish (swe)", Value: "swe" }],
  });
};

const requestsTo = (path: string) =>
  mockApi.mock.history.get.filter((request) => request.url?.includes(path));

const renderLanguageFilters = async (library: BaseItemDto) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  const { result } = await renderHook(() => useLanguageFilters(library), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    ),
  });
  return result;
};

// For the specs that expect no Filters2 call: the version has answered, and a
// wrongly enabled query has had the time to go out. Inside act, so the state
// updates React Query hands to a timer are flushed.
const versionAnswered = async () => {
  await waitFor(() =>
    expect(requestsTo("/System/Info/Public")).toHaveLength(1),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

test("offers the languages of a movie library on Jellyfin 12", async () => {
  serverRunning("12.0.0");

  const result = await renderLanguageFilters(MOVIES);

  await waitFor(() => expect(result.current.audio).toHaveLength(1));
  expect(result.current).toEqual({
    enabled: true,
    audio: [{ value: "eng", label: "English (eng)" }],
    subtitle: [{ value: "swe", label: "Swedish (swe)" }],
  });
});

test("offers nothing, and does not ask, on a server older than Jellyfin 12", async () => {
  serverRunning("10.11.11");

  const result = await renderLanguageFilters(MOVIES);
  await versionAnswered();

  expect(result.current).toEqual({ enabled: false, audio: [], subtitle: [] });
  expect(requestsTo("/Items/Filters2")).toHaveLength(0);
});

test("offers nothing, and does not ask, on a library without language filters", async () => {
  serverRunning("12.0.0");

  const result = await renderLanguageFilters(MUSIC);
  await versionAnswered();

  expect(result.current).toEqual({ enabled: false, audio: [], subtitle: [] });
  expect(requestsTo("/Items/Filters2")).toHaveLength(0);
});
