import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { TVSyncPlaySheet } from "./TVSyncPlaySheet";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 22, callout: 18 }),
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom({ Name: "Fredrik" }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));
jest.mock("./useSyncPlayQueueItems", () => ({
  useSyncPlayQueueItems: () => ({
    items: { movie: { Id: "movie", Name: "Arrival" } },
    failed: false,
    retry: jest.fn(),
  }),
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
  Participants: ["Fredrik"],
};
const entry = { ItemId: "movie", PlaylistItemId: "p1" };

const state = () => ({
  group: null as typeof mine | null,
  groups: [other, playing],
  groupState: null as string | null,
  supported: true,
  canCreate: true,
  connected: true,
  busy: false,
  error: null as string | null,
  watching: false,
  hasPrevious: false,
  hasNext: true,
  repeatMode: "RepeatNone",
  shuffleMode: "Sorted",
  ignoreWait: false,
  currentPlaylistItemId: null as string | null,
  playlist: [] as (typeof entry)[],
  queueItems: jest.fn().mockResolvedValue(undefined),
  refreshGroups: jest.fn().mockResolvedValue(undefined),
  clearError: jest.fn(),
  createGroup: jest.fn().mockResolvedValue(undefined),
  joinGroup: jest.fn().mockResolvedValue(undefined),
  switchGroup: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn().mockResolvedValue(undefined),
  startWatching: jest.fn().mockResolvedValue(undefined),
  requestStop: jest.fn().mockResolvedValue(undefined),
  requestPause: jest.fn().mockResolvedValue(undefined),
  requestUnpause: jest.fn().mockResolvedValue(undefined),
  requestPrevious: jest.fn().mockResolvedValue(undefined),
  requestNext: jest.fn().mockResolvedValue(undefined),
  setRepeatMode: jest.fn().mockResolvedValue(undefined),
  setShuffleMode: jest.fn().mockResolvedValue(undefined),
  setIgnoreWait: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();
const inGroup = (overrides: Partial<ReturnType<typeof state>> = {}) => {
  mockState = { ...state(), group: mine, groupState: "Idle", ...overrides };
};
const watchingGroup = (overrides: Partial<ReturnType<typeof state>> = {}) =>
  inGroup({
    groupState: "Playing",
    playlist: [entry],
    currentPlaylistItemId: "p1",
    ...overrides,
  });

const onClose = jest.fn();
const open = (seed: { ids: string[]; title: string } | null = null) =>
  render(<TVSyncPlaySheet seed={seed} onClose={onClose} />);
const press = (label: string) => fireEvent.press(screen.getByText(label));

beforeEach(() => {
  mockState = state();
  onClose.mockClear();
});

describe("outside a group", () => {
  test("offers a new group and the groups on the server", async () => {
    await open();
    expect(mockState.refreshGroups).toHaveBeenCalledTimes(1);
    await press("syncplay.new_group");
    expect(mockState.createGroup).toHaveBeenCalledWith(
      "syncplay.default_group_name Fredrik",
    );
    await press("Movie night");
    expect(mockState.joinGroup).toHaveBeenCalledWith("other");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("a group started from a page takes that page as its queue", async () => {
    const seed = { ids: ["movie"], title: "Arrival" };
    await open(seed);
    expect(
      screen.getByText("syncplay.new_group_queues Arrival 1"),
    ).toBeTruthy();
    await press("syncplay.new_group");
    inGroup();
    await screen.rerender(<TVSyncPlaySheet seed={seed} onClose={onClose} />);
    await waitFor(() =>
      expect(mockState.queueItems).toHaveBeenCalledWith(["movie"], "Queue"),
    );
  });

  test("leaves before joining a group that is playing, so the player has a clear screen", async () => {
    mockState.joinGroup.mockImplementation(async () => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    await open();
    await press("Series marathon");
    expect(mockState.joinGroup).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockState.joinGroup).toHaveBeenCalledWith("playing"),
    );
  });

  test("an account that may only join is not offered a new group", async () => {
    mockState.canCreate = false;
    await open();
    expect(screen.queryByText("syncplay.new_group")).toBeNull();
  });

  test("says why nothing can be done without the server, and does nothing", async () => {
    mockState.connected = false;
    await open();
    expect(screen.getByText("syncplay.disconnected")).toBeTruthy();
    await press("syncplay.new_group");
    expect(mockState.createGroup).not.toHaveBeenCalled();
  });
});

describe("in a group", () => {
  test("shows the group with its modes, and no queue", async () => {
    inGroup({ repeatMode: "RepeatAll" });
    await open();
    expect(screen.getByText("Fredrik's group")).toBeTruthy();
    expect(screen.getByText("syncplay.repeat_modes.RepeatAll")).toBeTruthy();
    expect(screen.queryByText("syncplay.queue")).toBeNull();
    await press("syncplay.repeat");
    expect(mockState.setRepeatMode).toHaveBeenCalledWith("RepeatOne");
    await press("syncplay.shuffle");
    expect(mockState.setShuffleMode).toHaveBeenCalledWith("Shuffle");
    await press("syncplay.ignore_wait");
    expect(mockState.setIgnoreWait).toHaveBeenCalledWith(true);
  });

  test("a queue that has not started starts for everyone, once the sheet is gone", async () => {
    inGroup({ playlist: [entry] });
    mockState.requestUnpause.mockImplementation(async () => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    await open();
    await press("syncplay.play_for_everyone");
    await waitFor(() =>
      expect(mockState.requestUnpause).toHaveBeenCalledTimes(1),
    );
  });

  test("names what plays and controls it without opening the player", async () => {
    watchingGroup();
    await open();
    expect(screen.getByText("Arrival")).toBeTruthy();
    await press("syncplay.pause");
    expect(mockState.requestPause).toHaveBeenCalledTimes(1);
    await press("live_tv.next");
    expect(mockState.requestNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("Watch goes back into the player", async () => {
    watchingGroup();
    await open();
    await press("syncplay.watch");
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockState.startWatching).toHaveBeenCalledTimes(1),
    );
  });

  // A disabled card would drop TV focus: it stays pressable and does nothing.
  test.each([
    [
      "previous at the start of the queue",
      "live_tv.previous",
      "requestPrevious",
    ],
    ["stop in an idle group", "syncplay.stop_for_everyone", "requestStop"],
  ] as const)("ignores %s", async (_name, label, request) => {
    if (request === "requestStop") inGroup();
    else watchingGroup();
    await open();
    await press(label);
    expect(mockState[request]).not.toHaveBeenCalled();
  });

  test("ignores a press while a request is pending", async () => {
    inGroup({ busy: true });
    await open();
    await press("syncplay.leave");
    expect(mockState.leaveGroup).not.toHaveBeenCalled();
  });

  test("another group is a switch, with a way back", async () => {
    inGroup();
    await open();
    expect(screen.queryByText("Movie night")).toBeNull();
    await press("syncplay.switch_group");
    await press("syncplay.back_to_group Fredrik's group");
    await press("syncplay.switch_group");
    await press("Movie night");
    expect(mockState.switchGroup).toHaveBeenCalledWith("other");
    expect(mockState.joinGroup).not.toHaveBeenCalled();
  });

  test("leaves only when asked", async () => {
    inGroup();
    await open();
    await press("syncplay.leave");
    expect(mockState.leaveGroup).toHaveBeenCalledTimes(1);
  });

  test("an error is shown with a way to try again", async () => {
    inGroup({ error: "The request failed." });
    await open();
    expect(screen.getByText("The request failed.")).toBeTruthy();
    await press("syncplay.retry");
    expect(mockState.clearError).toHaveBeenCalledTimes(1);
  });
});

test("exactly one card asks for the initial focus", async () => {
  watchingGroup();
  await open();
  type Node = ReturnType<typeof screen.toJSON>;
  const asking = (node: Node | string): number => {
    if (!node || typeof node === "string") return 0;
    if (Array.isArray(node))
      return node.reduce((sum, child) => sum + asking(child), 0);
    return (
      (node.props.hasTVPreferredFocus === true ? 1 : 0) +
      (node.children ?? []).reduce(
        (sum: number, child) => sum + asking(child as Node | string),
        0,
      )
    );
  };
  expect(asking(screen.toJSON())).toBe(1);
});
