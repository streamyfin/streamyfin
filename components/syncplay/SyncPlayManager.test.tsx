import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { SyncPlayManager } from "./SyncPlayManager";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

const movieNight = {
  GroupId: "movie-night",
  GroupName: "Movie night",
  Participants: ["Alice", "Bob"],
};

const state = () => ({
  group: null as typeof movieNight | null,
  groups: [] as (typeof movieNight)[],
  groupState: "Idle",
  supported: true,
  canCreate: true,
  connected: true,
  busy: false,
  error: null as string | null,
  clearError: jest.fn(),
  refreshGroups: jest.fn().mockResolvedValue(undefined),
  createGroup: jest.fn().mockResolvedValue(undefined),
  joinGroup: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn().mockResolvedValue(undefined),
  getGroup: jest.fn().mockResolvedValue(undefined),
  playlist: [],
  currentPlaylistItemId: null,
  repeatMode: "RepeatNone",
  shuffleMode: "Sorted",
  ignoreWait: false,
  resolveVideos: jest.fn().mockResolvedValue([]),
});

let mockState = state();

describe("SyncPlay group manager", () => {
  beforeEach(() => {
    mockState = state();
  });

  test("requires a nonblank name, trims it and clears it after creation", async () => {
    await render(<SyncPlayManager />);
    const input = screen.getByTestId("syncplay-name-input");
    await fireEvent.changeText(input, "   ");
    expect(
      screen.getByTestId("syncplay-create").props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.changeText(input, "  Friday night  ");
    await fireEvent.press(screen.getByTestId("syncplay-create"));
    await waitFor(() =>
      expect(mockState.createGroup).toHaveBeenCalledWith("Friday night"),
    );
    expect(screen.getByTestId("syncplay-name-input").props.value).toBe("");
  }, 60_000);

  test("retains the entered name after creation fails", async () => {
    mockState.createGroup.mockRejectedValue(new Error("Denied"));
    await render(<SyncPlayManager />);
    await fireEvent.changeText(
      screen.getByTestId("syncplay-name-input"),
      "Friday night",
    );
    await fireEvent.press(screen.getByTestId("syncplay-create"));
    await waitFor(() => expect(mockState.createGroup).toHaveBeenCalled());
    expect(screen.getByTestId("syncplay-name-input").props.value).toBe(
      "Friday night",
    );
  });

  test("refreshes available groups and joins the selected group", async () => {
    mockState.groups = [movieNight];
    await render(<SyncPlayManager />);
    expect(mockState.refreshGroups).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Alice, Bob")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-join-movie-night"));
    expect(mockState.joinGroup).toHaveBeenCalledWith("movie-night");
  });

  test.each(["connected", "supported"] as const)(
    "gates group creation and joining when %s is false",
    async (flag) => {
      mockState[flag] = false;
      mockState.groups = [movieNight];
      await render(<SyncPlayManager />);
      expect(screen.getByTestId("syncplay-unavailable")).toBeTruthy();
      expect(screen.getByTestId("syncplay-name-input").props.editable).toBe(
        false,
      );
      expect(
        screen.getByTestId("syncplay-join-movie-night").props.accessibilityState
          .disabled,
      ).toBe(true);
      expect(mockState.refreshGroups).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId("syncplay-join-movie-night"));
      expect(mockState.joinGroup).not.toHaveBeenCalled();
    },
  );

  test("shows participants and state, and permits leaving while reconnecting", async () => {
    mockState.group = movieNight;
    mockState.connected = false;
    mockState.groupState = "Playing";
    await render(<SyncPlayManager />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("syncplay.reconnecting")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-leave"));
    expect(mockState.leaveGroup).toHaveBeenCalled();
  });

  test("refreshes the current group without leaving it", async () => {
    mockState.group = movieNight;
    await render(<SyncPlayManager />);
    await fireEvent.press(screen.getByTestId("syncplay-refresh-group"));
    expect(mockState.getGroup).toHaveBeenCalledWith(movieNight.GroupId);
    expect(mockState.leaveGroup).not.toHaveBeenCalled();
  });

  test("requires leaving the current group before joining another", async () => {
    mockState.group = { ...movieNight, GroupId: "mine" };
    mockState.groups = [movieNight];
    await render(<SyncPlayManager />);
    expect(screen.getByText("syncplay.leave_to_join")).toBeTruthy();
    expect(
      screen.getByTestId("syncplay-join-movie-night").props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  test("an account with join-only permission can join but cannot create", async () => {
    mockState.canCreate = false;
    mockState.groups = [movieNight];
    await render(<SyncPlayManager />);
    expect(screen.getByTestId("syncplay-name-input").props.editable).toBe(
      false,
    );
    expect(screen.getByText("syncplay.errors.create_denied")).toBeTruthy();
    expect(
      screen.getByTestId("syncplay-create").props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId("syncplay-join-movie-night").props.accessibilityState
        .disabled,
    ).toBe(false);
  });

  test("exposes request errors with a retry action", async () => {
    mockState.error = "Unable to connect";
    await render(<SyncPlayManager />);
    expect(screen.getByText("Unable to connect")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("syncplay-retry"));
    expect(mockState.clearError).toHaveBeenCalledTimes(1);
    expect(mockState.refreshGroups).toHaveBeenCalledTimes(2);
  });

  test("blocks duplicate actions while a request is in progress", async () => {
    mockState.busy = true;
    mockState.groups = [movieNight];
    await render(<SyncPlayManager />);
    expect(screen.getByTestId("syncplay-loading")).toBeTruthy();
    expect(
      screen.getByTestId("syncplay-join-movie-night").props.accessibilityState
        .disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByTestId("syncplay-join-movie-night"));
    expect(mockState.joinGroup).not.toHaveBeenCalled();
  });
});
