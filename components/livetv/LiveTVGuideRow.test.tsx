import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";
import { LiveTVGuideRow } from "./LiveTVGuideRow";

jest.mock("../common/TouchableItemRouter", () => ({
  TouchableItemRouter: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const channel = { Id: "channel-1" } as BaseItemDto;
const program = {
  Id: "program-1",
  Name: "Long Movie",
  ChannelId: "channel-1",
  StartDate: "2026-01-01T20:00:00Z",
  EndDate: "2026-01-01T21:45:00Z",
} as BaseItemDto;

const marginLeftOf = (root: TestInstance | null) => {
  const [titleContainer] = root!.queryAll(
    (node) => StyleSheet.flatten(node.props?.style)?.marginLeft !== undefined,
  );
  return StyleSheet.flatten(titleContainer.props.style).marginLeft;
};

describe("LiveTVGuideRow", () => {
  test("pins the title while the program overlaps the scrolled left edge", async () => {
    const { root, rerender } = await render(
      <LiveTVGuideRow channel={channel} programs={[program]} scrollX={30} />,
    );

    expect(marginLeftOf(root)).toBe(30);

    await rerender(
      <LiveTVGuideRow channel={channel} programs={[program]} scrollX={300} />,
    );

    expect(marginLeftOf(root)).toBe(300);
  });

  test("does not pin once the program scrolls fully past the edge", async () => {
    const { root, rerender } = await render(
      <LiveTVGuideRow channel={channel} programs={[program]} scrollX={350} />,
    );

    expect(marginLeftOf(root)).toBe(0);

    await rerender(
      <LiveTVGuideRow channel={channel} programs={[program]} scrollX={0} />,
    );

    expect(marginLeftOf(root)).toBe(0);
  });
});
