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
import { apiAtom } from "@/providers/JellyfinProvider";
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

const renderGuide = async (seed?: (client: QueryClient) => void) => {
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
  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <LiveTvGuidePage />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  // Lets a query that started on mount settle.
  await act(async () => {});
  return { store, errors };
};

describe("LiveTvGuidePage", () => {
  // Sentry REACT-NATIVE-FG: the guide mounted before the api was restored and
  // handed the null api to the SDK, which threw "Cannot read property
  // 'configuration' of null".
  test("does not ask for the channels before the api is there", async () => {
    const { errors } = await renderGuide();

    expect(errors).toEqual([]);
  });

  // The app persists its query cache, so the channels can be there from the
  // last launch while the api is not: the programs wait for both. The query
  // key does not carry the api, so programs settled without one never load.
  test("loads the programs of restored channels only once the api is there", async () => {
    const api = guideApi();
    const { store, errors } = await renderGuide((client) =>
      client.setQueryData(["livetv", "channels", 1], CHANNELS),
    );

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
