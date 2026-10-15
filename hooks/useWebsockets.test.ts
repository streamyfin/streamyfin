import { renderHook } from "@testing-library/react-native";
import { useWebSocket } from "./useWebsockets";

let mockMessage: { MessageType: string; Data: unknown } | null = null;
const mockClear = jest.fn();
const mockRouter = { canGoBack: () => true, back: jest.fn(), push: jest.fn() };

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({
    lastMessage: mockMessage,
    clearLastMessage: mockClear,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const props = {
  isPlaying: true,
  togglePlay: jest.fn(),
  stopPlayback: jest.fn(),
  seekPlayback: jest.fn(),
  offline: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMessage = null;
});

test.each(["Pause", "Unpause", "Seek", "Stop"])(
  "leaves SyncPlay %s commands to the scheduled coordinator",
  async (Command) => {
    mockMessage = {
      MessageType: "SyncPlayCommand",
      Data: { Command, PositionTicks: 420000000 },
    };
    await renderHook(() => useWebSocket(props));
    expect(props.togglePlay).not.toHaveBeenCalled();
    expect(props.seekPlayback).not.toHaveBeenCalled();
    expect(props.stopPlayback).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  },
);

test("ordinary GeneralCommand pause still controls the player", async () => {
  mockMessage = { MessageType: "GeneralCommand", Data: { Name: "Pause" } };
  await renderHook(() => useWebSocket(props));
  expect(props.togglePlay).toHaveBeenCalledTimes(1);
  expect(mockClear).toHaveBeenCalledTimes(1);
});

test("ordinary Playstate seek reads the flat payload", async () => {
  mockMessage = {
    MessageType: "Playstate",
    Data: { Command: "Seek", SeekPositionTicks: 420000000 },
  };
  await renderHook(() => useWebSocket(props));
  expect(props.seekPlayback).toHaveBeenCalledWith(420000000);
});
