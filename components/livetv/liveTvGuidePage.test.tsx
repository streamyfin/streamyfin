// Spec for app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/guide.tsx.
// It lives here rather than next to the page because Expo Router turns every
// file under app/ into a route.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import LiveTvGuidePage from "@/app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/guide";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(null),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/components/common/ItemImage", () => ({ ItemImage: () => null }));
// The row layout is not what is under test; a channel shows up as the names
// of its programs.
jest.mock("@/components/livetv/LiveTVGuideRow", () => ({
  LiveTVGuideRow: ({
    channel,
    programs,
  }: {
    channel: BaseItemDto;
    programs?: BaseItemDto[] | null;
  }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    return programs
      ?.filter((program) => program.ChannelId === channel.Id)
      .map((program) => <RowText key={program.Id}>{program.Name}</RowText>);
  },
}));

const CHANNELS = {
  Items: [{ Id: "channel-1", Name: "One", Type: "TvChannel" }],
  TotalRecordCount: 1,
};
const PROGRAMS = {
  Items: [{ Id: "program-1", Name: "Evening News", ChannelId: "channel-1" }],
};

const guideApi = () => {
  const api = makeApi();
  // The SDK writes the query into the url.
  api.mock.onGet(/\/LiveTv\/Channels\?/).reply(200, CHANNELS);
  api.mock.onPost(/\/LiveTv\/Programs$/).reply(200, PROGRAMS);
  return api;
};

const renderGuide = async ({
  api = null,
  seed,
}: {
  api?: ReturnType<typeof makeApi> | null;
  seed?: (client: QueryClient) => void;
} = {}) => {
  /** What the app's own query cache would have handed to Sentry. */
  const errors: Error[] = [];
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => errors.push(error) }),
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  seed?.(client);
  const store = createStore();
  store.set(apiAtom, api);
  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <LiveTvGuidePage />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  // Lets a query that started on mount settle.
  await act(async () => {});
  return { store, client, errors };
};

describe("LiveTvGuidePage", () => {
  // Sentry REACT-NATIVE-FG: the user logged out with the guide still mounted
  // behind the login screen. The teardown nulls the api and clears the query
  // cache in one go, so the guide started its channels query again, on a null
  // api, and the SDK threw "Cannot read property 'configuration' of null".
  test("does not ask for the channels again when the session is torn down", async () => {
    const api = guideApi();
    const { store, client, errors } = await renderGuide({ api });
    await waitFor(() => expect(screen.getByText("Evening News")).toBeTruthy());

    // What clearSessionState in JellyfinProvider does.
    await act(async () => {
      store.set(userAtom, null);
      store.set(apiAtom, null);
      client.clear();
    });

    expect(errors).toEqual([]);
    expect(api.mock.history.get).toHaveLength(1);
    expect(api.mock.history.post).toHaveLength(1);
  });

  test("does not ask for the channels without an api", async () => {
    const { errors } = await renderGuide();

    expect(errors).toEqual([]);
  });

  // The programs need the api as much as they need the channels: channels
  // that are in the cache while the api is gone must not start them. The
  // query key does not carry the api, so programs settled without one would
  // not load when it arrives.
  test("loads the programs of cached channels only once the api is there", async () => {
    const api = guideApi();
    const { store, errors } = await renderGuide({
      seed: (client) =>
        client.setQueryData(["livetv", "channels", 1], CHANNELS),
    });

    expect(errors).toEqual([]);

    await act(async () => store.set(apiAtom, api));

    await waitFor(() => expect(screen.getByText("Evening News")).toBeTruthy());
    expect(api.mock.history.post).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("loads the channels, then their programs, once the api arrives", async () => {
    const api = guideApi();
    const { store, errors } = await renderGuide();

    await act(async () => store.set(apiAtom, api));

    await waitFor(() => expect(screen.getByText("Evening News")).toBeTruthy());
    expect(api.mock.history.get).toHaveLength(1);
    expect(api.mock.history.get[0].url).toContain("userId=user-1");
    expect(api.mock.history.post).toHaveLength(1);
    expect(JSON.parse(api.mock.history.post[0].data)).toMatchObject({
      ChannelIds: ["channel-1"],
    });
    expect(errors).toEqual([]);
  });
});
