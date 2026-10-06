import { fireEvent, render, screen } from "@testing-library/react-native";
import { SyncPlayStatus } from "./SyncPlayStatus";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));
jest.mock("./SyncPlayGroupControls", () => ({
  SyncPlayGroupControls: () => {
    const { View } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <View testID='mock-group-controls' />;
  },
}));

const state = () => ({
  group: {
    GroupId: "movie-night",
    GroupName: "Movie night",
    Participants: ["Alice"],
  } as { GroupId: string; GroupName: string; Participants: string[] } | null,
  groupState: "Playing",
  connected: true,
  busy: false,
  error: null,
  hasPrevious: true,
  hasNext: true,
  requestPrevious: jest.fn().mockResolvedValue(undefined),
  requestNext: jest.fn().mockResolvedValue(undefined),
  leaveGroup: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();

describe("SyncPlay playback group controls", () => {
  beforeEach(() => {
    mockState = state();
  });
  test("requests the previous and next item from the group queue", async () => {
    await render(<SyncPlayStatus />);
    await fireEvent.press(screen.getByTestId("syncplay-player-previous"));
    await fireEvent.press(screen.getByTestId("syncplay-player-next"));
    expect(mockState.requestPrevious).toHaveBeenCalledTimes(1);
    expect(mockState.requestNext).toHaveBeenCalledTimes(1);
  }, 60_000);
  test.each(["busy", "connected", "hasNext", "hasPrevious"] as const)(
    "gates unavailable queue controls for %s",
    async (key) => {
      mockState[key] = key === "busy";
      await render(<SyncPlayStatus />);
      const previous = screen.getByTestId("syncplay-player-previous");
      const next = screen.getByTestId("syncplay-player-next");
      if (key !== "hasNext") {
        expect(previous.props.accessibilityState.disabled).toBe(true);
        await fireEvent.press(previous);
        expect(mockState.requestPrevious).not.toHaveBeenCalled();
      }
      if (key !== "hasPrevious") {
        expect(next.props.accessibilityState.disabled).toBe(true);
        await fireEvent.press(next);
        expect(mockState.requestNext).not.toHaveBeenCalled();
      }
    },
  );
  test("does not show group controls during solo playback", async () => {
    mockState.group = null;
    await render(<SyncPlayStatus />);
    expect(screen.queryByTestId("syncplay-player-status")).toBeNull();
  });
  test("opens queue controls without leaving playback and dismisses when membership ends", async () => {
    const view = await render(<SyncPlayStatus />);
    await fireEvent.press(screen.getByTestId("syncplay-player-queue"));
    expect(screen.getByTestId("syncplay-player-queue-modal")).toBeTruthy();
    expect(screen.getByTestId("mock-group-controls")).toBeTruthy();
    expect(mockState.leaveGroup).not.toHaveBeenCalled();
    mockState.group = null;
    await view.rerender(<SyncPlayStatus />);
    expect(screen.queryByTestId("syncplay-player-queue-modal")).toBeNull();
  });
});
