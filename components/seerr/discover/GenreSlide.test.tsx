import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import React from "react";
import { SeerrApi } from "@/hooks/useSeerr";
import { type DiscoverSlider, DiscoverSliderType } from "@/utils/seerr/types";
import GenreSlide from "./GenreSlide";
import { TVGenreSlide } from "./TVGenreSlide";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// Ships as ES modules, which Jest does not load, and nothing here toasts.
jest.mock("sonner-native", () => ({ toast: {} }));
// The real log loads Sentry, whose timers keep Jest from exiting.
jest.mock("@/utils/log", () => ({
  writeToLog: jest.fn(),
  writeErrorLog: jest.fn(),
  logAndCaptureError: jest.fn(),
}));
// The settings atom imports the screens that edit it. The TV row only reads
// the typography scale, and the Seerr client nothing.
jest.mock("@/utils/atoms/settings", () => ({
  TVTypographyScale: { Default: "default" },
  useSettings: () => ({ settings: { tvTypographyScale: "default" } }),
}));
// The real client, answering what the test says, behind the hook the slides
// read it from.
jest.mock("@/hooks/useSeerr", () => ({
  ...jest.requireActual("@/hooks/useSeerr"),
  useSeerr: () => ({ seerrApi: mockSeerrApi }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// FlashList ships as ES modules, which Jest does not load. FlatList reads the
// row the same way: as many items as `data.length`, each through
// `keyExtractor(data[index])`, which is where the phone's row crashed.
jest.mock("@shopify/flash-list", () => ({
  FlashList: jest.requireActual("react-native").FlatList,
}));
// The rows' headings, by their keys: the TV's through the hook, the phone's
// through i18next itself.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("i18next", () => ({
  ...jest.requireActual("i18next"),
  t: (key: string) => key,
}));

let mockSeerrApi: SeerrApi;

// A Seerr that answers 200 with what `body()` gives at the time, as the wire
// carries it: axios parses it, and hands back a string it could not parse.
const answering = (body: () => string) => {
  const api = new SeerrApi("https://seerr.example");
  const adapter: AxiosAdapter = async (config) => ({
    data: body(),
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });
  api.axios.defaults.adapter = adapter;
  return api;
};

const slide = {
  id: 4,
  type: DiscoverSliderType.MOVIE_GENRES,
  order: 4,
  enabled: true,
  isBuiltIn: true,
} as DiscoverSlider;
const queryKey = ["seerr", "discover", slide.type, slide.id];

const genres = JSON.stringify([
  { id: 28, name: "Action", backdrops: ["/action.jpg"] },
  { id: 18, name: "Drama", backdrops: [] },
]);
const SIGN_IN_PAGE = "<!DOCTYPE html><html><body>Sign in</body></html>";

// Records what a render threw, instead of letting it end the test run.
class Boundary extends React.Component<
  { onError: (error: Error) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const renderRow = async (row: React.ReactElement, cached?: unknown) => {
  const client = new QueryClient({
    // No garbage collection timer nor retry: either keeps Jest from exiting.
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  if (cached !== undefined) client.setQueryData(queryKey, cached);
  const errors: Error[] = [];
  await render(
    <QueryClientProvider client={client}>
      <Boundary onError={(error) => errors.push(error)}>{row}</Boundary>
    </QueryClientProvider>,
  );
  return { client, errors };
};

// The genres row reads GET /discover/genreslider/{movie,tv}. A 200 there is
// not always Seerr's list: a page answering in its place (a proxy's sign-in
// page, a server URL pointing at the web app) reaches the row as a string,
// whose characters it read as genres and crashed on. Sentry REACT-NATIVE-WG
// is that crash, right after a 200 from that route.
describe.each([
  ["on the phone", () => <GenreSlide slide={slide} />],
  ["on the TV", () => <TVGenreSlide slide={slide} />],
])("the genres row %s", (_platform, row) => {
  test("shows the genres Seerr sends", async () => {
    mockSeerrApi = answering(() => genres);
    const { errors } = await renderRow(row());
    expect(await screen.findByText("Drama")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
    expect(screen.getByText("search.movie_genres")).toBeTruthy();
    expect(errors).toEqual([]);
  });

  // What the event shows: the row was up, and the answer to its refetch,
  // a 200, crashed it under way.
  test("goes away, without crashing, when a page answers its refetch", async () => {
    let body = genres;
    mockSeerrApi = answering(() => body);
    const { client, errors } = await renderRow(row());
    expect(await screen.findByText("Drama")).toBeTruthy();

    body = SIGN_IN_PAGE;
    await act(() => client.refetchQueries({ queryKey }));
    await waitFor(() => expect(screen.queryByText("Drama")).toBeNull());
    expect(errors).toEqual([]);
    expect(screen.queryByText("search.movie_genres")).toBeNull();
  });

  // The query cache is kept on the device for a day, so a page stored by an
  // earlier version reaches the first render of this one.
  test("shows no row when what was cached is a page", async () => {
    mockSeerrApi = answering(() => SIGN_IN_PAGE);
    const { errors } = await renderRow(row(), SIGN_IN_PAGE);
    expect(errors).toEqual([]);
    expect(screen.queryByText("search.movie_genres")).toBeNull();
  });
});
