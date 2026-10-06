import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SyncPlayGroupControls } from "./SyncPlayGroupControls";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

const state = () => ({
  group: { GroupId: "group", GroupName: "Together", Participants: ["Alice"] },
  groupState: "Playing",
  connected: true,
  busy: false,
  playlist: [
    { ItemId: "movie-a", PlaylistItemId: "first-a" },
    { ItemId: "movie-a", PlaylistItemId: "second-a" },
    { ItemId: "movie-b", PlaylistItemId: "movie-b-entry" },
  ],
  currentPlaylistItemId: "first-a",
  repeatMode: "RepeatNone",
  shuffleMode: "Sorted",
  ignoreWait: false,
  hasPrevious: false,
  hasNext: true,
  resolveVideos: jest.fn().mockResolvedValue([
    { Id: "movie-a", Name: "Arrival", Type: "Movie" },
    { Id: "movie-b", Name: "Dune", Type: "Movie" },
  ]),
  listVideos: jest.fn().mockResolvedValue([
    {
      Id: "episode",
      Name: "Pilot",
      SeriesName: "Severance",
      Type: "Episode",
    },
  ]),
  requestPlaylistItem: jest.fn().mockResolvedValue(undefined),
  removePlaylistItems: jest.fn().mockResolvedValue(undefined),
  movePlaylistItem: jest.fn().mockResolvedValue(undefined),
  clearPlaylist: jest.fn().mockResolvedValue(undefined),
  setRepeatMode: jest.fn().mockResolvedValue(undefined),
  setShuffleMode: jest.fn().mockResolvedValue(undefined),
  setIgnoreWait: jest.fn().mockResolvedValue(undefined),
  requestPause: jest.fn().mockResolvedValue(undefined),
  requestUnpause: jest.fn().mockResolvedValue(undefined),
  requestStop: jest.fn().mockResolvedValue(undefined),
  requestPrevious: jest.fn().mockResolvedValue(undefined),
  requestNext: jest.fn().mockResolvedValue(undefined),
  getGroup: jest.fn().mockResolvedValue(undefined),
  playItems: jest.fn().mockResolvedValue(undefined),
  queueItems: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();

describe("SyncPlay shared queue", () => {
  beforeEach(() => {
    mockState = state();
  });

  test("resolves titles and edits duplicate videos by their unique playlist IDs", async () => {
    await render(<SyncPlayGroupControls showLibrary={false} />);
    await waitFor(() => expect(screen.getByText("2. Arrival")).toBeTruthy());
    expect(screen.getByText("syncplay.now_playing")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-queue-select-second-a"));
    await fireEvent.press(screen.getByTestId("syncplay-queue-remove-second-a"));
    await fireEvent.press(
      screen.getByTestId("syncplay-queue-up-movie-b-entry"),
    );
    await fireEvent.press(screen.getByTestId("syncplay-queue-down-second-a"));

    expect(mockState.requestPlaylistItem).toHaveBeenCalledWith("second-a");
    expect(mockState.removePlaylistItems).toHaveBeenCalledWith(["second-a"]);
    expect(mockState.movePlaylistItem).toHaveBeenNthCalledWith(
      1,
      "movie-b-entry",
      1,
    );
    expect(mockState.movePlaylistItem).toHaveBeenNthCalledWith(
      2,
      "second-a",
      2,
    );
    expect(screen.getByText("2. Arrival")).toBeTruthy();
    expect(
      screen.getByTestId("syncplay-queue-up-first-a").props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(
      screen.getByTestId("syncplay-queue-down-movie-b-entry").props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  test.each([
    ["RepeatNone", "RepeatAll"],
    ["RepeatAll", "RepeatOne"],
    ["RepeatOne", "RepeatNone"],
  ])("cycles %s to %s through the group server", async (from, to) => {
    mockState.repeatMode = from;
    await render(<SyncPlayGroupControls showLibrary={false} />);
    await fireEvent.press(screen.getByTestId("syncplay-repeat"));
    expect(mockState.setRepeatMode).toHaveBeenCalledWith(to);
  });

  test("sends shuffle and this-device ignore-wait settings without optimistic queue changes", async () => {
    await render(<SyncPlayGroupControls showLibrary={false} />);
    await fireEvent.press(screen.getByTestId("syncplay-shuffle"));
    await fireEvent.press(screen.getByTestId("syncplay-ignore-wait"));
    expect(mockState.setShuffleMode).toHaveBeenCalledWith("Shuffle");
    expect(mockState.setIgnoreWait).toHaveBeenCalledWith(true);
    expect(
      screen.getByTestId("syncplay-shuffle").props.accessibilityState.checked,
    ).toBe(false);
    expect(
      screen.getByTestId("syncplay-ignore-wait").props.accessibilityState
        .checked,
    ).toBe(false);
  });

  test("distinguishes clearing other videos from stopping and clearing everything", async () => {
    await render(<SyncPlayGroupControls showLibrary={false} />);
    await fireEvent.press(screen.getByTestId("syncplay-clear-upcoming"));
    await fireEvent.press(screen.getByTestId("syncplay-clear-all"));
    await fireEvent.press(screen.getByTestId("syncplay-controls-stop"));
    await fireEvent.press(
      screen.getByTestId("syncplay-controls-refresh-group"),
    );
    expect(mockState.clearPlaylist).toHaveBeenNthCalledWith(1, false);
    expect(mockState.clearPlaylist).toHaveBeenNthCalledWith(2, true);
    expect(mockState.requestStop).toHaveBeenCalledTimes(1);
    expect(mockState.getGroup).toHaveBeenCalledWith("group");
  });

  test.each(["busy", "connected"] as const)(
    "gates queue mutations when %s prevents requests",
    async (key) => {
      mockState[key] = key === "busy";
      await render(<SyncPlayGroupControls showLibrary={false} />);
      for (const id of [
        "syncplay-repeat",
        "syncplay-shuffle",
        "syncplay-ignore-wait",
        "syncplay-clear-all",
        "syncplay-controls-stop",
        "syncplay-queue-select-first-a",
      ])
        expect(screen.getByTestId(id).props.accessibilityState.disabled).toBe(
          true,
        );
      await fireEvent.press(screen.getByTestId("syncplay-clear-all"));
      expect(mockState.clearPlaylist).not.toHaveBeenCalled();
    },
  );

  test("searches titled videos and sends PlayNext and Append without replacing the queue", async () => {
    await render(<SyncPlayGroupControls />);
    await fireEvent.press(screen.getByTestId("syncplay-add-videos"));
    await waitFor(() =>
      expect(screen.getByText("Severance · Pilot")).toBeTruthy(),
    );
    await fireEvent.changeText(
      screen.getByTestId("syncplay-video-search"),
      "Severance",
    );
    await waitFor(() =>
      expect(mockState.listVideos).toHaveBeenLastCalledWith("Severance"),
    );
    await waitFor(() =>
      expect(screen.queryByTestId("syncplay-videos-loading")).toBeNull(),
    );
    await fireEvent.press(screen.getByTestId("syncplay-library-next-episode"));
    await fireEvent.press(
      screen.getByTestId("syncplay-library-append-episode"),
    );
    expect(mockState.queueItems).toHaveBeenNthCalledWith(
      1,
      ["episode"],
      "QueueNext",
    );
    expect(mockState.queueItems).toHaveBeenNthCalledWith(
      2,
      ["episode"],
      "Queue",
    );
    expect(mockState.playItems).not.toHaveBeenCalled();
  });

  test("retries a failed library request", async () => {
    mockState.listVideos.mockRejectedValueOnce(new Error("Offline"));
    await render(<SyncPlayGroupControls />);
    await fireEvent.press(screen.getByTestId("syncplay-add-videos"));
    await waitFor(() =>
      expect(screen.getByTestId("syncplay-videos-retry")).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId("syncplay-videos-retry"));
    await waitFor(() =>
      expect(screen.getByText("Severance · Pilot")).toBeTruthy(),
    );
    expect(mockState.listVideos).toHaveBeenCalledTimes(2);
  });
});
