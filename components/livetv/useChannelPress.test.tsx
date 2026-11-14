import { renderHook } from "@testing-library/react-native";
import { channelPlayerHref, useChannelPress } from "./useChannelPress";

const mockRouter = { push: jest.fn() };

jest.mock("expo-router", () => ({
  useSegments: () => ["(auth)", "(tabs)", "(search)"],
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  itemRouter: (item: { Id: string }, from: string) =>
    `${from}/items/${item.Id}`,
}));

const channel = { Id: "channel-1", Type: "TvChannel" as const };

describe("useChannelPress", () => {
  beforeEach(() => mockRouter.push.mockClear());

  test("plays the channel on a tap", async () => {
    const { result } = await renderHook(() => useChannelPress(channel));
    result.current.onPress();

    expect(mockRouter.push).toHaveBeenCalledWith(
      channelPlayerHref("channel-1"),
    );
  });

  test("opens what the channel is airing on a long press", async () => {
    const { result } = await renderHook(() =>
      useChannelPress({ ...channel, CurrentProgram: { Id: "program-1" } }),
    );
    result.current.onLongPress();

    expect(mockRouter.push).toHaveBeenCalledWith("(search)/items/program-1");
  });

  test("opens the channel on a long press when it airs nothing known", async () => {
    const { result } = await renderHook(() => useChannelPress(channel));
    result.current.onLongPress();

    expect(mockRouter.push).toHaveBeenCalledWith("(search)/items/channel-1");
  });
});
