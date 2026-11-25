import { fireEvent, render, screen } from "@testing-library/react-native";
import { channelPlayerHref } from "@/components/livetv/useChannelPress";
import { SearchChannelCard } from "./SearchChannelCard";

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
jest.mock("@/components/common/ItemImage", () => ({ ItemImage: () => null }));

const channel = {
  Id: "channel-1",
  Name: "Das Erste HD",
  Type: "TvChannel" as const,
};

describe("SearchChannelCard", () => {
  beforeEach(() => mockRouter.push.mockClear());

  // The same channel plays on a tap in the Channels list.
  test("plays the channel on a tap", async () => {
    await render(<SearchChannelCard channel={channel} />);
    fireEvent.press(screen.getByRole("button", { name: "Das Erste HD" }));

    expect(mockRouter.push).toHaveBeenCalledWith(
      channelPlayerHref("channel-1"),
    );
  });

  test("opens the channel's details on a long press", async () => {
    await render(<SearchChannelCard channel={channel} />);
    fireEvent(
      screen.getByRole("button", { name: "Das Erste HD" }),
      "longPress",
    );

    expect(mockRouter.push).toHaveBeenCalledWith("(search)/items/channel-1");
  });
});
