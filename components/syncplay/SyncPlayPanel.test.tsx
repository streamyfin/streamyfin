import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SyncPlayPanel } from "./SyncPlayPanel";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom({ Name: "Fredrik" }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));
// Their own specs cover them.
jest.mock("./SyncPlayControls", () => ({
  SyncPlayPlayback: () => null,
  SyncPlayOptions: () => null,
}));
jest.mock("./SyncPlayQueue", () => ({ SyncPlayQueue: () => null }));
jest.mock("./useSyncPlayQueueItems", () => ({
  useSyncPlayQueueItems: () => ({ items: {}, failed: false, retry: jest.fn() }),
}));

const other = {
  GroupId: "other",
  GroupName: "Movie night",
  Participants: ["Alice"],
  State: "Idle",
};
const playing = {
  ...other,
  GroupId: "playing",
  GroupName: "Series marathon",
  State: "Playing",
};
const mine = {
  GroupId: "mine",
  GroupName: "Fredrik's group",
  Participants: [],
};

const state = () => ({
  group: null as typeof mine | null,
  groups: [other, playing],
  groupState: null as string | null,
  supported: true,
  canCreate: true,
  connected: true,
  busy: false,
  error: null as string | null,
  watching: true,
  currentPlaylistItemId: null as string | null,
  playlist: [] as { ItemId: string; PlaylistItemId: string }[],
  queueItems: jest.fn().mockResolvedValue(undefined),
  refreshGroups: jest.fn().mockResolvedValue(undefined),
  clearError: jest.fn(),
  createGroup: jest.fn().mockResolvedValue(undefined),
  joinGroup: jest.fn().mockResolvedValue(undefined),
  switchGroup: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn().mockResolvedValue(undefined),
  requestStop: jest.fn().mockResolvedValue(undefined),
  playItems: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();
const inGroup = (overrides: Partial<ReturnType<typeof state>> = {}) => {
  mockState = { ...state(), group: mine, groupState: "Idle", ...overrides };
};

beforeEach(() => {
  mockState = state();
});

describe("outside a group", () => {
  test("lists the groups to join and loads them on opening", async () => {
    await render(<SyncPlayPanel />);
    expect(mockState.refreshGroups).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Movie night")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-join-other"));
    expect(mockState.joinGroup).toHaveBeenCalledWith("other");
  });

  test("closes after joining a group that is playing, since the player opens", async () => {
    const onClose = jest.fn();
    await render(<SyncPlayPanel onClose={onClose} />);
    await fireEvent.press(screen.getByTestId("syncplay-join-other"));
    await waitFor(() => expect(mockState.joinGroup).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("syncplay-join-playing"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("a new group needs no name from the user", async () => {
    await render(<SyncPlayPanel />);
    await fireEvent.press(screen.getByTestId("syncplay-create"));
    expect(mockState.createGroup).toHaveBeenCalledWith(
      "syncplay.default_group_name Fredrik",
    );
  });

  test("an account that may only join is not offered a new group", async () => {
    mockState.canCreate = false;
    await render(<SyncPlayPanel />);
    expect(screen.queryByTestId("syncplay-create")).toBeNull();
  });

  test("starting a group starts nothing: Play does that", async () => {
    await render(<SyncPlayPanel />);
    expect(screen.getByText("syncplay.how_to_play")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-create"));
    inGroup();
    await screen.rerender(<SyncPlayPanel />);
    expect(mockState.playItems).not.toHaveBeenCalled();
  });

  test("a group started from a page takes that page as its queue, and plays nothing", async () => {
    const seed = { ids: ["e1", "e2"], title: "Severance" };
    await render(<SyncPlayPanel seed={seed} />);
    expect(
      screen.getByText("syncplay.new_group_queues Severance 2"),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-create"));
    expect(mockState.queueItems).not.toHaveBeenCalled();
    inGroup();
    await screen.rerender(<SyncPlayPanel seed={seed} />);
    await waitFor(() =>
      expect(mockState.queueItems).toHaveBeenCalledWith(["e1", "e2"], "Queue"),
    );
    expect(mockState.playItems).not.toHaveBeenCalled();
  });

  test("joining someone else's group leaves their queue alone", async () => {
    const seed = { ids: ["e1"], title: "Severance" };
    await render(<SyncPlayPanel seed={seed} />);
    await fireEvent.press(screen.getByTestId("syncplay-join-other"));
    inGroup();
    await screen.rerender(<SyncPlayPanel seed={seed} />);
    expect(mockState.queueItems).not.toHaveBeenCalled();
  });

  test("says why nothing can be done without the server", async () => {
    mockState.connected = false;
    await render(<SyncPlayPanel />);
    expect(screen.getByText("syncplay.disconnected")).toBeTruthy();
    expect(mockState.refreshGroups).not.toHaveBeenCalled();
  });
});

describe("in a group", () => {
  test("shows the group and leaves only when asked", async () => {
    inGroup();
    await render(<SyncPlayPanel />);
    expect(screen.getByText("Fredrik's group")).toBeTruthy();
    expect(screen.queryByTestId("syncplay-create")).toBeNull();
    await fireEvent.press(screen.getByTestId("syncplay-leave"));
    expect(mockState.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("stopping stops it for everyone, and an idle group has nothing to stop", async () => {
    inGroup({ groupState: "Playing" });
    await render(<SyncPlayPanel />);
    await fireEvent.press(screen.getByTestId("syncplay-controls-stop"));
    expect(mockState.requestStop).toHaveBeenCalledTimes(1);
    inGroup({ groupState: "Idle" });
    await screen.rerender(<SyncPlayPanel />);
    expect(
      screen.getByTestId("syncplay-controls-stop").props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  test("another group is a switch, not a second membership", async () => {
    inGroup();
    await render(<SyncPlayPanel />);
    expect(screen.queryByTestId("syncplay-join-other")).toBeNull();
    await fireEvent.press(screen.getByTestId("syncplay-switch"));
    await fireEvent.press(screen.getByTestId("syncplay-join-other"));
    expect(mockState.switchGroup).toHaveBeenCalledWith("other");
    expect(mockState.joinGroup).not.toHaveBeenCalled();
  });

  test("the list of other groups has a way back to the current one", async () => {
    inGroup();
    await render(<SyncPlayPanel />);
    await fireEvent.press(screen.getByTestId("syncplay-switch"));
    await fireEvent.press(screen.getByTestId("syncplay-back"));
    expect(screen.getByTestId("syncplay-leave")).toBeTruthy();
  });

  test("leaving reloads the list, which still counts this device in the group", async () => {
    inGroup();
    const refreshGroups = mockState.refreshGroups;
    await render(<SyncPlayPanel />);
    expect(refreshGroups).toHaveBeenCalledTimes(1);
    mockState = { ...mockState, group: null, groupState: null };
    await screen.rerender(<SyncPlayPanel />);
    expect(refreshGroups).toHaveBeenCalledTimes(2);
  });

  test("an error is shown with a way to try again", async () => {
    inGroup({ error: "The request failed." });
    await render(<SyncPlayPanel />);
    expect(screen.getByText("The request failed.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-retry"));
    expect(mockState.clearError).toHaveBeenCalledTimes(1);
  });
});
