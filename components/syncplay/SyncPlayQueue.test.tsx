import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import { dragRow, shownItems } from "@/test-utils/drax";
import { SyncPlayQueue } from "./SyncPlayQueue";

// The real list needs gestures and layout: the double renders the same rows
// and lets the spec drop a dragged one.
jest.mock(
  "react-native-drax",
  () => jest.requireActual("@/test-utils/drax").draxModule,
);
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
  shownItems(screen.getAllByTestId("drax-item")).map(
    (item) =>
      within(item).getByText(/^(Arrival|Pilot)$/).props.children as string,
  );
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
  await act(async () => dragRow(2, 0));
  expect(mockState.movePlaylistItem).toHaveBeenCalledWith("movie-b-entry", 0);
  expect(titles()).toEqual(["Pilot", "Arrival", "Arrival"]);
});

// drax keeps rendering the entries where they were and moves them with
// transforms, so a press used to act on the entry that had been in that place.
test("after a drag, a press acts on the entry pressed", async () => {
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  await act(async () => dragRow(2, 0));
  await fireEvent.press(screen.getByTestId("syncplay-queue-row-movie-b-entry"));
  await fireEvent.press(screen.getByTestId("syncplay-queue-remove-second-a"));
  expect(mockState.requestPlaylistItem).toHaveBeenCalledWith("movie-b-entry");
  expect(mockState.removePlaylistItems).toHaveBeenCalledWith(["second-a"]);
});

test("a move the server refuses goes back where it was", async () => {
  mockState.movePlaylistItem.mockRejectedValueOnce(new Error("denied"));
  await render(<SyncPlayQueue items={items} />);
  await loaded();
  await act(async () => dragRow(2, 0));
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
