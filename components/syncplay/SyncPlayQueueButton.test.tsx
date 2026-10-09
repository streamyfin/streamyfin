import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SyncPlayQueueButton } from "./SyncPlayQueueButton";

let mockChoice: number | undefined;
const mockToast = { success: jest.fn(), error: jest.fn() };
let mockOffline = false;

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({
    showActionSheetWithOptions: (
      _options: unknown,
      onSelect: (index?: number) => void,
    ) => onSelect(mockChoice),
  }),
}));
jest.mock("sonner-native", () => ({
  get toast() {
    return mockToast;
  },
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

const state = () => ({
  enabled: true,
  connected: true,
  busy: false,
  queueItems: jest.fn().mockResolvedValue(undefined),
});
let mockState = state();
const season = [
  { Id: "e1", Type: "Episode" as const },
  { Id: "e2", Type: "Episode" as const },
];

beforeEach(() => {
  mockState = state();
  mockChoice = undefined;
  mockOffline = false;
  mockToast.success.mockClear();
  mockToast.error.mockClear();
});

test.each([
  [0, "QueueNext"],
  [1, "Queue"],
])("choice %i sends the whole selection as %s", async (choice, mode) => {
  mockChoice = choice;
  await render(<SyncPlayQueueButton items={season} />);
  await fireEvent.press(screen.getByTestId("syncplay-queue-add"));
  expect(mockState.queueItems).toHaveBeenCalledWith(["e1", "e2"], mode);
  await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(1));
});

test("cancelling adds nothing", async () => {
  mockChoice = 2;
  await render(<SyncPlayQueueButton items={season} />);
  await fireEvent.press(screen.getByTestId("syncplay-queue-add"));
  expect(mockState.queueItems).not.toHaveBeenCalled();
});

test("a refused request says so", async () => {
  mockChoice = 1;
  mockState.queueItems.mockRejectedValueOnce(new Error("denied"));
  await render(<SyncPlayQueueButton items={season} />);
  await fireEvent.press(screen.getByTestId("syncplay-queue-add"));
  await waitFor(() => expect(mockToast.error).toHaveBeenCalledTimes(1));
});

test.each([
  ["outside a group", () => (mockState.enabled = false)],
  ["for downloaded content", () => (mockOffline = true)],
])("is not there %s", async (_name, arrange) => {
  arrange();
  await render(<SyncPlayQueueButton items={season} />);
  expect(screen.queryByTestId("syncplay-queue-add")).toBeNull();
});

test("is not there when the page has nothing a group can play", async () => {
  await render(
    <SyncPlayQueueButton items={[{ Id: "series", Type: "Series" }]} />,
  );
  expect(screen.queryByTestId("syncplay-queue-add")).toBeNull();
});

test("takes its spacing from the gap alone, not from the row around it", async () => {
  // What a `space-x-*` row does to each of its children.
  const fromRow = { style: { marginLeft: 8 } };
  await render(
    <SyncPlayQueueButton items={season} trailingGap={12} {...fromRow} />,
  );
  const style = StyleSheet.flatten(
    screen.getByTestId("syncplay-queue-add").props.style,
  );
  expect(style.marginLeft).toBeUndefined();
  expect(style.marginRight).toBe(12);
});
