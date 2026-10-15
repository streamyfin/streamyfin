import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SyncPlayOptions, SyncPlayPlayback } from "./SyncPlayControls";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom({ basePath: "http://host" }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));
jest.mock("@/components/Button", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    Button: ({ children, onPress, disabled, testID }: any) => (
      <Pressable testID={testID} onPress={onPress} disabled={disabled}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

const state = () => ({
  group: { GroupId: "group", GroupName: "Together", Participants: ["Alice"] },
  groupState: "Playing" as string | null,
  connected: true,
  busy: false,
  watching: true,
  playlist: [{ ItemId: "movie-a", PlaylistItemId: "first-a" }],
  currentPlaylistItemId: "first-a" as string | null,
  repeatMode: "RepeatNone",
  shuffleMode: "Sorted",
  ignoreWait: false,
  hasPrevious: false,
  hasNext: true,
  setRepeatMode: jest.fn().mockResolvedValue(undefined),
  setShuffleMode: jest.fn().mockResolvedValue(undefined),
  setIgnoreWait: jest.fn().mockResolvedValue(undefined),
  requestPause: jest.fn().mockResolvedValue(undefined),
  requestUnpause: jest.fn().mockResolvedValue(undefined),
  requestPrevious: jest.fn().mockResolvedValue(undefined),
  requestNext: jest.fn().mockResolvedValue(undefined),
  startWatching: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();
const items = {
  "movie-a": {
    Id: "movie-a",
    Name: "Arrival",
    Type: "Movie",
    ProductionYear: 2016,
  },
} as const;

const disabledState = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.disabled;

beforeEach(() => {
  mockState = state();
});

describe("what the group is playing", () => {
  test("names the video and pauses a playing group", async () => {
    await render(<SyncPlayPlayback items={items} />);
    expect(screen.getByText("Arrival")).toBeTruthy();
    expect(screen.getByText("2016")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-controls-play-pause"));
    await fireEvent.press(screen.getByTestId("syncplay-controls-next"));
    expect(mockState.requestPause).toHaveBeenCalledTimes(1);
    expect(mockState.requestNext).toHaveBeenCalledTimes(1);
    expect(disabledState("syncplay-controls-previous")).toBe(true);
  });

  test("a paused group is resumed", async () => {
    mockState.groupState = "Paused";
    await render(<SyncPlayPlayback items={items} />);
    await fireEvent.press(screen.getByTestId("syncplay-controls-play-pause"));
    expect(mockState.requestUnpause).toHaveBeenCalledTimes(1);
  });

  test("offers the way back to a player that was closed", async () => {
    const onClose = jest.fn();
    mockState.watching = false;
    await render(<SyncPlayPlayback items={items} onClose={onClose} />);
    await fireEvent.press(screen.getByTestId("syncplay-watch"));
    expect(mockState.startWatching).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("has no way back to offer while the player is open", async () => {
    await render(<SyncPlayPlayback items={items} />);
    expect(screen.queryByTestId("syncplay-watch")).toBeNull();
  });

  test("an idle group with a queue offers to start it for everyone", async () => {
    mockState.groupState = "Idle";
    mockState.currentPlaylistItemId = null;
    await render(<SyncPlayPlayback items={items} />);
    expect(screen.getByText("syncplay.play_for_everyone")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-controls-play-pause"));
    expect(mockState.requestUnpause).toHaveBeenCalledTimes(1);
  });

  test("an empty group says how to get something playing", async () => {
    mockState.groupState = "Idle";
    mockState.currentPlaylistItemId = null;
    mockState.playlist = [];
    await render(<SyncPlayPlayback items={{}} />);
    expect(screen.getByText("syncplay.how_to_play")).toBeTruthy();
  });
});

describe("how the group plays", () => {
  test.each([
    ["RepeatNone", "RepeatAll"],
    ["RepeatAll", "RepeatOne"],
    ["RepeatOne", "RepeatNone"],
  ])("a press steps repeat from %s to %s", async (from, to) => {
    mockState.repeatMode = from;
    await render(<SyncPlayOptions />);
    expect(screen.getByText(`syncplay.repeat_modes.${from}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-repeat"));
    expect(mockState.setRepeatMode).toHaveBeenCalledWith(to);
  });

  test("sends shuffle and ignore wait without switching them itself", async () => {
    await render(<SyncPlayOptions />);
    await fireEvent(
      screen.getByTestId("syncplay-shuffle"),
      "valueChange",
      true,
    );
    await fireEvent(
      screen.getByTestId("syncplay-ignore-wait"),
      "valueChange",
      true,
    );
    expect(mockState.setShuffleMode).toHaveBeenCalledWith("Shuffle");
    expect(mockState.setIgnoreWait).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("syncplay-shuffle").props.value).toBe(false);
    expect(screen.getByTestId("syncplay-ignore-wait").props.value).toBe(false);
  });

  test("turning shuffle off restores the sorted order", async () => {
    mockState.shuffleMode = "Shuffle";
    await render(<SyncPlayOptions />);
    await fireEvent(
      screen.getByTestId("syncplay-shuffle"),
      "valueChange",
      false,
    );
    expect(mockState.setShuffleMode).toHaveBeenCalledWith("Sorted");
  });

  test.each(["busy", "connected"] as const)(
    "nothing can be asked while %s prevents requests",
    async (key) => {
      mockState[key] = key === "busy";
      await render(
        <>
          <SyncPlayPlayback items={items} />
          <SyncPlayOptions />
        </>,
      );
      for (const id of [
        "syncplay-controls-play-pause",
        "syncplay-controls-next",
        "syncplay-repeat",
      ])
        expect(disabledState(id)).toBe(true);
      expect(screen.getByTestId("syncplay-shuffle").props.disabled).toBe(true);
      expect(screen.getByTestId("syncplay-ignore-wait").props.disabled).toBe(
        true,
      );
    },
  );
});
