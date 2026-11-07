import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { logAndCaptureError } from "@/utils/log";
import { TVLibraries } from "./TVLibraries";

jest.mock("@/providers/JellyfinProvider", () =>
  jest
    .requireActual("@/test-utils/jellyfinProvider")
    .makeJellyfinAtomsModule(null, { Id: "user-1" }),
);
jest.mock("@/utils/atoms/settings", () =>
  jest
    .requireActual("@/test-utils/settings")
    .makeSettingsModule({ hiddenLibraries: [] }),
);
// The real log writes to MMKV, which no test environment has.
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
// The rows draw a backdrop only when a preview item has one.

const LIVE_TV = { Id: "livetv-1", Name: "Live TV", CollectionType: "livetv" };
const MOVIES = { Id: "movies-1", Name: "Movies", CollectionType: "movies" };

const renderLibraries = async (
  views: object[],
  channels: [number, object] = [200, { Items: [], TotalRecordCount: 42 }],
) => {
  const api = makeApi();
  api.mock.onGet(/\/UserViews\?/).reply(200, { Items: views });
  api.mock.onGet(/\/LiveTv\/Channels\?/).reply(...channels);
  api.mock.onGet(/\/Items\?/).reply(200, { Items: [], TotalRecordCount: 12 });
  const store = createStore();
  store.set(apiAtom, api);
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <TVLibraries />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  return api;
};

describe("TVLibraries", () => {
  // Channels are not children of the Live TV view: counting its items gives 0.
  test("counts the channels of the Live TV view", async () => {
    const api = await renderLibraries([LIVE_TV]);

    await waitFor(() =>
      expect(screen.getByText("42 live_tv.tabs.channels")).toBeTruthy(),
    );
    const urls = api.mock.history.get.map((request) => request.url ?? "");
    expect(urls.filter((url) => url.includes("/Items?"))).toEqual([]);
  });

  // The channel count is its own request: when it fails, the other rows keep
  // their counts, as they did when Live TV was counted with them.
  test("keeps the other counts when the channel count fails", async () => {
    await renderLibraries([LIVE_TV, MOVIES], [500, {}]);

    await waitFor(() =>
      expect(screen.getByText("12 library.item_types.movies")).toBeTruthy(),
    );
    expect(screen.getByText("Live TV")).toBeTruthy();
    expect(screen.queryByText(/live_tv\.tabs\.channels/)).toBeNull();
    expect(logAndCaptureError).toHaveBeenCalledWith(
      "Failed to count the Live TV channels",
      expect.anything(),
    );
  });
});
