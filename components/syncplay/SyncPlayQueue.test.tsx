import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SyncPlayQueue } from "./SyncPlayQueue";

let mockDragEnd: (move: { from: number; to: number }) => void = () => {};

// The real list needs gesture handlers. This one renders the same rows and
// hands the test its drag callback.
jest.mock("react-native-draggable-flatlist", () => {
  const { View } = jest.requireActual("react-native");
  const List = ({
    data,
    renderItem,
    keyExtractor,
    onDragEnd,
    testID,
    ListEmptyComponent,
  }: any) => {
    mockDragEnd = onDragEnd;
    return (
      <View testID={testID}>
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item: any, index: number) => (
              <View key={keyExtractor(item)}>
                {renderItem({
                  item,
                  drag: () => {},
                  isActive: false,
                  getIndex: () => index,
                })}
              </View>
            ))}
      </View>
    );
  };
  return {
    __esModule: true,
    default: List,
    ScaleDecorator: ({ children }: any) => children,
  };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom({ basePath: "http://host" }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

const state = () => ({
  group: { GroupId: "group", GroupName: "Together", Participants: ["Alice"] },
  connected: true,
  busy: false,
  playlist: [
    { ItemId: "movie-a", PlaylistItemId: "first-a" },
    { ItemId: "movie-a", PlaylistItemId: "second-a" },
    { ItemId: "movie-b", PlaylistItemId: "movie-b-entry" },
  ],
  currentPlaylistItemId: "first-a",
  requestPlaylistItem: jest.fn().mockResolvedValue(undefined),
  removePlaylistItems: jest.fn().mockResolvedValue(undefined),
  movePlaylistItem: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();
const items = {
  "movie-a": {
    Id: "movie-a",
    Name: "Arrival",
    Type: "Movie",
    ProductionYear: 2016,
  },
  "movie-b": {
    Id: "movie-b",
    Name: "Pilot",
    Type: "Episode",
    SeriesName: "Severance",
    SeriesId: "series",
    ParentIndexNumber: 1,
    IndexNumber: 1,
  },
} as const;

const titles = () =>
  screen
    .getAllByText(/^(Arrival|Pilot)$/)
    .map((node) => node.props.children as string);
const loaded = () =>
  waitFor(() => expect(titles()).toEqual(["Arrival", "Arrival", "Pilot"]));

beforeEach(() => {
  mockState = state();
});

test("shows each entry with its title and what it belongs to", async () => {
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  expect(screen.getAllByText("2016")).toHaveLength(2);
  expect(screen.getByText("Severance · S1:E1")).toBeTruthy();
});

test("acts on duplicate videos by their own playlist entry", async () => {
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  await fireEvent.press(screen.getByTestId("syncplay-queue-row-second-a"));
  await fireEvent.press(screen.getByTestId("syncplay-queue-remove-second-a"));
  expect(mockState.requestPlaylistItem).toHaveBeenCalledWith("second-a");
  expect(mockState.removePlaylistItems).toHaveBeenCalledWith(["second-a"]);
});

test("a drag asks the server to move the entry and shows it moved at once", async () => {
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  await act(async () => mockDragEnd({ from: 2, to: 0 }));
  expect(mockState.movePlaylistItem).toHaveBeenCalledWith("movie-b-entry", 0);
  expect(titles()).toEqual(["Pilot", "Arrival", "Arrival"]);
});

test("a move the server refuses goes back where it was", async () => {
  mockState.movePlaylistItem.mockRejectedValueOnce(new Error("denied"));
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  await act(async () => mockDragEnd({ from: 2, to: 0 }));
  await loaded();
});

test("an empty queue says so", async () => {
  mockState.playlist = [];
  await render(<SyncPlayQueue items={items} />);
  expect(screen.getByText("syncplay.empty_queue")).toBeTruthy();
});

test.each(["busy", "connected"] as const)(
  "rows ignore presses when %s prevents requests",
  async (key) => {
    mockState[key] = key === "busy";
    await render(<SyncPlayQueue items={items} />);
    for (const id of [
      "syncplay-queue-row-first-a",
      "syncplay-queue-remove-first-a",
    ])
      expect(screen.getByTestId(id).props.accessibilityState.disabled).toBe(
        true,
      );
  },
);

test("outside a group there is no queue", async () => {
  (mockState as { group: unknown }).group = null;
  await render(<SyncPlayQueue items={items} />);
  expect(screen.queryByText("syncplay.queue")).toBeNull();
});
