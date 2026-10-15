import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { useUpcomingEpisodes } from "@/hooks/useUpcomingEpisodes";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { formatAirTime } from "@/utils/upcomingEpisodes";
import { TVUpcoming } from "./TVUpcoming";
import { Upcoming } from "./Upcoming";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  return { apiAtom: atom(make()), userAtom: atom({ Id: "user-1" }) };
});
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US" },
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ title: 1, heading: 1, body: 1, callout: 1 }),
}));
jest.mock("@/constants/TVSizes", () => ({
  useScaledTVSizes: () => ({
    padding: { horizontal: 0, scale: 0 },
    gaps: { item: 0, section: 0 },
  }),
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: () => {} }));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: () => {} }),
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
}));
// The cards are not what is under test: an episode shows up as its name, with
// whatever the screen draws over its artwork.
jest.mock("@/components/tv/TVPosterCard", () => ({
  TVPosterCard: (props: {
    item: BaseItemDto;
    overlay?: React.ReactNode;
    hasTVPreferredFocus?: boolean;
    onFocus?: () => void;
  }) => {
    const { Text, View } = jest.requireActual("react-native");
    return (
      <View
        testID={props.hasTVPreferredFocus ? "preferred-focus" : "card"}
        onFocus={props.onFocus}
      >
        <Text>{props.item.Name}</Text>
        {props.overlay}
      </View>
    );
  },
}));
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: (props: { title: string; items: BaseItemDto[] }) => {
    const { Text } = jest.requireActual("react-native");
    return (
      <Text>{[props.title, ...props.items.map((i) => i.Name)].join("|")}</Text>
    );
  },
}));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const episode = (name: string, day: string, airTime?: string): BaseItemDto => ({
  Id: name,
  Name: name,
  Type: "Episode",
  // A day, stored as midnight UTC, as the server gives it.
  PremiereDate: `${day}T00:00:00.0000000Z`,
  AirTime: airTime,
});

/** Query of the nth request sent: the SDK writes it into the URL. */
const requested = (index: number) =>
  Object.fromEntries(new URL(api.mock.history.get[index].url!).searchParams);

// No garbage collection timer nor retry: either keeps Jest from exiting.
const withQueryClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

const renderScreen = (screenUnderTest: React.ReactElement) =>
  render(screenUnderTest, { wrapper: withQueryClient() });

describe("Upcoming", () => {
  beforeEach(() => api.mock.reset());

  test("a TV library lists its upcoming episodes under the day they air", async () => {
    api.mock.onGet(/\/Shows\/Upcoming/).reply(200, {
      Items: [
        episode("Pilot", "2099-03-03", "21:00"),
        episode("Second", "2099-03-03"),
        episode("Finale", "2099-03-05"),
      ],
    });

    await renderScreen(<TVUpcoming parentId='library-1' />);

    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    expect(screen.getByText("Tuesday, March 3")).toBeTruthy();
    expect(screen.getByText("Thursday, March 5")).toBeTruthy();
    // The air time is drawn on the one episode whose series has one, in the
    // device's own clock format.
    expect(screen.getAllByText(formatAirTime("21:00")!)).toHaveLength(1);
    // Exactly one element asks for the initial focus (docs/conventions/tv.md).
    expect(screen.getAllByTestId("preferred-focus")).toHaveLength(1);
    expect(requested(0)).toMatchObject({
      parentId: "library-1",
      userId: "user-1",
      startIndex: "0",
      limit: "25",
    });
  });

  // The endpoint reports no usable total: a full page means there may be more.
  test("asks for the next page where the loaded ones end", async () => {
    const fullPage = Array.from({ length: 25 }, (_, i) =>
      episode(`Episode ${i}`, "2099-03-03"),
    );
    api.mock
      .onGet(/\/Shows\/Upcoming/)
      .replyOnce(200, { Items: fullPage, TotalRecordCount: 25 })
      .onGet(/\/Shows\/Upcoming/)
      .reply(200, { Items: [episode("Later", "2099-03-05")] });

    const { result } = await renderHook(() => useUpcomingEpisodes(), {
      wrapper: withQueryClient(),
    });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    await act(async () => result.current.loadMore());

    await waitFor(() => expect(result.current.groups).toHaveLength(2));
    expect(requested(1)).toMatchObject({ startIndex: "25" });
  });

  test("says so when nothing is about to air", async () => {
    api.mock.onGet(/\/Shows\/Upcoming/).reply(200, { Items: [] });

    await renderScreen(<TVUpcoming parentId='library-1' />);

    await waitFor(() =>
      expect(screen.getByText("upcoming.no_episodes")).toBeTruthy(),
    );
  });

  // An empty list is a statement about the library; a failed request is not.
  test("does not call a failed request an empty library", async () => {
    api.mock.onGet(/\/Shows\/Upcoming/).reply(500);

    await renderScreen(<TVUpcoming parentId='library-1' />);

    await waitFor(() =>
      expect(screen.getByText("common.something_went_wrong")).toBeTruthy(),
    );
    expect(screen.queryByText("upcoming.no_episodes")).toBeNull();
  });

  // The list unmounts far rows: a first card mounting again would otherwise
  // ask for the focus a second time and pull it back to the top.
  test("stops asking for the initial focus once a card has it", async () => {
    api.mock.onGet(/\/Shows\/Upcoming/).reply(200, {
      Items: [episode("Pilot", "2099-03-03"), episode("Finale", "2099-03-05")],
    });

    await renderScreen(<TVUpcoming />);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    await fireEvent(screen.getByTestId("preferred-focus"), "focus");

    expect(screen.queryByTestId("preferred-focus")).toBeNull();
  });

  test("the phone lists the same days, one row each", async () => {
    api.mock.onGet(/\/Shows\/Upcoming/).reply(200, {
      Items: [episode("Pilot", "2099-03-03"), episode("Finale", "2099-03-05")],
    });

    await renderScreen(<Upcoming parentId='library-1' />);

    await waitFor(() =>
      expect(screen.getByText("Tuesday, March 3|Pilot")).toBeTruthy(),
    );
    expect(screen.getByText("Thursday, March 5|Finale")).toBeTruthy();
  });
});
