import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";
import {
  LIVE_TV_GUIDE_HOUR_WIDTH as HOUR,
  LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH,
} from "@/constants/LiveTVGuide";
import { makeSharedValue } from "@/test-utils/reanimated";
import { LiveTVGuideRow } from "./LiveTVGuideRow";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
  __esModule: true,
}));

const channel = { Id: "channel-1" } as BaseItemDto;
// The time the guide's header starts at.
const REFERENCE = new Date("2026-01-01T20:00:00Z");

const program = (name: string, start: string, end: string): BaseItemDto => ({
  Id: name,
  Name: name,
  ChannelId: "channel-1",
  StartDate: `2026-01-01T${start}:00Z`,
  EndDate: `2026-01-01T${end}:00Z`,
});

const styleOf = (node: TestInstance) => StyleSheet.flatten(node.props.style);

/** Where each cell starts and how wide it is, gaps included, left to right. */
const cellsOf = (root: TestInstance | null) =>
  root!
    .queryAll((node) => styleOf(node)?.position === "absolute")
    // A cell sits 2 points inside its time span on either side.
    .map((node) => ({
      left: styleOf(node).left - 2,
      width: styleOf(node).width + 4,
    }));

/** How far each title has moved into its program, cell by cell. */
const titleOffsetsOf = (root: TestInstance | null) =>
  root!
    .queryAll((node) => styleOf(node)?.marginLeft !== undefined)
    .map((node) => styleOf(node).marginLeft);

const renderRow = (programs: BaseItemDto[], scrollX = 0) =>
  render(
    <LiveTVGuideRow
      channel={channel}
      programs={programs}
      scrollXShared={makeSharedValue(scrollX) as never}
      referenceTime={REFERENCE}
      nowMs={REFERENCE.getTime()}
      onPress={jest.fn()}
      onLongPress={jest.fn()}
    />,
  );

describe("LiveTVGuideRow", () => {
  test("places each program at its start, from the guide's first time", async () => {
    const { root } = await renderRow([
      program("Running", "19:00", "21:00"),
      program("Next", "21:00", "21:30"),
      program("After a gap", "22:00", "23:00"),
    ]);

    expect(cellsOf(root).slice(0, 4)).toEqual([
      { left: 0, width: HOUR },
      { left: HOUR, width: HOUR / 2 },
      { left: 1.5 * HOUR, width: HOUR / 2 },
      { left: 2 * HOUR, width: HOUR },
    ]);
  });

  test("draws nothing for a program over before the first time", async () => {
    const { root } = await renderRow([
      program("Over", "18:00", "19:30"),
      program("Now", "20:00", "21:00"),
    ]);

    expect(cellsOf(root)[0]).toEqual({ left: 0, width: HOUR });
  });

  test("moves a title along while its program is scrolled past the edge", async () => {
    const { root } = await renderRow(
      [program("Long Movie", "20:00", "21:45")],
      30,
    );

    expect(titleOffsetsOf(root)).toEqual([30]);
  });

  // Following the edge to the program's end, a title had a few points left
  // and wrapped again on every scroll step.
  test("stops a title short of its program's end, so it keeps its room", async () => {
    const { root } = await renderRow(
      [program("Long Movie", "20:00", "21:45")],
      300,
    );

    expect(titleOffsetsOf(root)).toEqual([
      1.75 * HOUR - LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH,
    ]);
  });

  test("leaves the title of a short program where it is", async () => {
    const { root } = await renderRow([program("News", "20:00", "20:30")], 40);

    expect(titleOffsetsOf(root)).toEqual([0]);
  });

  test("does not move a title before its program reaches the edge", async () => {
    const { root } = await renderRow(
      [program("First", "20:00", "21:00"), program("Second", "21:00", "23:00")],
      40,
    );

    expect(titleOffsetsOf(root)).toEqual([40, 0]);
  });
});
