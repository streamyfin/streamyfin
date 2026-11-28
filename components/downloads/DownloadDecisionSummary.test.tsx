import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type {
  DownloadDecisions,
  ItemDecision,
} from "@/hooks/useDownloadDecisions";
import { DownloadDecisionSummary } from "./DownloadDecisionSummary";

// The list scrolls through gesture handler's ScrollView, which the sheet's own
// pan defers to; here a plain one stands in for it.
jest.mock("react-native-gesture-handler", () => ({
  ...jest.requireActual("@/test-utils/gestureHandler").gestureHandlerModule,
  ScrollView: jest.requireActual("react-native").ScrollView,
}));

const episode = (season: number, number: number): BaseItemDto => ({
  Id: `s${season}e${number}`,
  Type: "Episode",
  Name: `Episode ${number}`,
  ParentIndexNumber: season,
  IndexNumber: number,
});

/** The counts the hook would report for these items. */
const decisionsOf = (items: ItemDecision[]): DownloadDecisions => ({
  items,
  total: items.length,
  checked: items.filter((i) => i.status !== "checking").length,
  direct: items.filter((i) => i.decision?.kind === "direct").length,
  transcode: items.filter((i) => i.decision?.kind === "transcode").length,
  failed: items.filter((i) => i.status === "failed").length,
});

const direct = (item: BaseItemDto): ItemDecision => ({
  item,
  status: "done",
  decision: { kind: "direct" },
});

const transcode = (item: BaseItemDto, reasons: string[]): ItemDecision => ({
  item,
  status: "done",
  decision: { kind: "transcode", reasons },
});

describe("DownloadDecisionSummary", () => {
  it("renders nothing when there is nothing to download", async () => {
    await render(<DownloadDecisionSummary decisions={decisionsOf([])} />);

    expect(screen.toJSON()).toBeNull();
  });

  it("says a single item comes down as the original file", async () => {
    await render(
      <DownloadDecisionSummary
        decisions={decisionsOf([direct(episode(1, 1))])}
      />,
    );

    expect(screen.getByText("item_card.download.decision_direct")).toBeTruthy();
  });

  it("gives a single transcode's reasons", async () => {
    await render(
      <DownloadDecisionSummary
        decisions={decisionsOf([
          transcode(episode(1, 1), ["AudioCodecNotSupported"]),
        ])}
      />,
    );

    expect(
      screen.getByText("item_card.download.decision_transcode"),
    ).toBeTruthy();
  });

  it("shows progress until every episode is checked", async () => {
    const items: ItemDecision[] = Array.from({ length: 22 }, (_, index) =>
      index < 14
        ? direct(episode(1, index + 1))
        : { item: episode(1, index + 1), status: "checking" },
    );

    await render(<DownloadDecisionSummary decisions={decisionsOf(items)} />);

    expect(
      screen.getByText("item_card.download.decisions_progress"),
    ).toBeTruthy();
  });

  it("lists the episodes that transcode on press", async () => {
    await render(
      <DownloadDecisionSummary
        decisions={decisionsOf([
          transcode(episode(1, 3), ["AudioCodecNotSupported"]),
          direct(episode(1, 4)),
        ])}
      />,
    );
    expect(screen.queryByText(/S01E03/)).toBeNull();

    await fireEvent.press(
      screen.getByText("item_card.download.decisions_summary"),
    );

    expect(screen.getByText(/S01E03/)).toBeTruthy();
    expect(screen.queryByText(/S01E04/)).toBeNull();
  });

  // A series lists every transcoded episode; on the phone 19 rows already
  // pushed the sheet to the top, and more would push Download off screen.
  it("scrolls a long list instead of growing the sheet", async () => {
    const items = Array.from({ length: 40 }, (_, index) =>
      transcode(episode(1, index + 1), ["SubtitleCodecNotSupported"]),
    );
    await render(<DownloadDecisionSummary decisions={decisionsOf(items)} />);

    await fireEvent.press(
      screen.getByText("item_card.download.decisions_summary"),
    );

    expect(screen.getByTestId("download-decisions-list")).toHaveStyle({
      maxHeight: expect.any(Number),
    });
  });
});
