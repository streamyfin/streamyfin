import { render, screen } from "@testing-library/react-native";
import { HourHeader } from "./HourHeader";

const time = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

describe("HourHeader", () => {
  test("labels the first slot with its full time", async () => {
    const referenceTime = new Date(2026, 10, 10, 18, 30);
    await render(<HourHeader height={40} referenceTime={referenceTime} />);

    const [first] = screen.getAllByText(/:\d\d$/);
    expect(first).toHaveTextContent(time(referenceTime));
  });

  // The suite runs in New York's time zone (test-utils/timeZone.ts), where the
  // clocks went from 2:00 to 3:00 on 8 March 2026 and back on 1 November.
  // Labels step by elapsed time, as the rows place programs.
  const firstLabels = async (referenceTime: Date) => {
    await render(<HourHeader height={40} referenceTime={referenceTime} />);
    return screen
      .getAllByText(/:\d\d$/)
      .slice(0, 4)
      .map((label) => label.props.children);
  };

  test("skips the hour the clocks skip", async () => {
    expect(await firstLabels(new Date(2026, 2, 8, 1, 0))).toEqual([
      time(new Date(2026, 2, 8, 1, 0)),
      time(new Date(2026, 2, 8, 1, 30)),
      time(new Date(2026, 2, 8, 3, 0)),
      time(new Date(2026, 2, 8, 3, 30)),
    ]);
  });

  test("shows the hour the clocks repeat twice", async () => {
    const start = new Date(2026, 10, 1, 1, 0);
    const halfHour = 30 * 60 * 1000;
    const labels = await firstLabels(start);

    expect(labels[0]).toBe(labels[2]);
    expect(labels).toEqual(
      [0, 1, 2, 3].map((i) => time(new Date(start.getTime() + i * halfHour))),
    );
  });
});
