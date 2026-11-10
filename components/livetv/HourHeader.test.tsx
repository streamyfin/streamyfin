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
});
