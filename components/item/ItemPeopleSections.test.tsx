import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ItemPeopleSections } from "@/components/item/ItemPeopleSections";
import { pendingIdleCallbacks } from "@/test-utils/idleCallback";

const mockPeople: BaseItemPerson[] = [
  { Id: "person-1", Name: "Ada Actor", Type: "Actor" },
];
let mockOffline = false;
/** Whether the page asked the server for its people. */
let mockRequested = false;

// Stands in for the React Query hook: the people arrive once it is enabled.
jest.mock("@/hooks/useItemPeopleQuery", () => ({
  useItemPeopleQuery: (_itemId: string | undefined, enabled: boolean) => {
    if (enabled) mockRequested = true;
    return { data: enabled ? mockPeople : undefined, isLoading: false };
  },
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
// The real row needs the router and the API; the names are what matters here.
const MockCastAndCrew = ({ item }: { item: BaseItemDto }) => (
  <Text>{item.People?.map((person) => person.Name).join(", ")}</Text>
);
jest.mock("@/components/series/CastAndCrew", () => ({
  CastAndCrew: (props: { item: BaseItemDto }) => MockCastAndCrew(props),
}));
jest.mock("@/components/MoreMoviesWithActor", () => ({
  MoreMoviesWithActor: () => null,
}));

const item = { Id: "movie-1", Name: "Movie" } as BaseItemDto;

describe("ItemPeopleSections", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOffline = false;
    mockRequested = false;
  });
  afterEach(() => jest.useRealTimers());

  // The request waits for the JS thread to be idle, so it does not compete
  // with the rest of the item page while it mounts.
  test("shows the cast once the JS thread is idle", async () => {
    await render(<ItemPeopleSections item={item} />);
    expect(screen.queryByText("Ada Actor")).toBeNull();
    expect(mockRequested).toBe(false);

    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.getByText("Ada Actor")).toBeTruthy();
  });

  test("shows nothing and asks for nothing offline", async () => {
    mockOffline = true;
    await render(<ItemPeopleSections item={item} />);

    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.queryByText("Ada Actor")).toBeNull();
    expect(mockRequested).toBe(false);
  });

  // An unmounted page never re-renders, so a leftover idle task would not
  // show on screen: what proves it was cancelled is that none is pending.
  test("leaves no idle task behind when the page is gone", async () => {
    const view = await render(<ItemPeopleSections item={item} />);
    expect(pendingIdleCallbacks()).toBe(1);

    await view.unmount();
    expect(pendingIdleCallbacks()).toBe(0);
  });
});
