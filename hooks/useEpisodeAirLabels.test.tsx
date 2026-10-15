import { renderHook } from "@testing-library/react-native";
import { useEpisodeAirLabels } from "./useEpisodeAirLabels";

// A stable `t`, as react-i18next hands out: the labels must not depend on it
// changing to notice that the day has.
jest.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t, i18n: { language: "en" } }) };
});

describe("useEpisodeAirLabels", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // The Upcoming screen stays mounted in its tab. Its labels were worked out
  // against the moment of its first render, so the next morning yesterday's
  // row still read "Today".
  test("a screen left open overnight relabels its days", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 30) });
    const { result, rerender } = await renderHook(() => useEpisodeAirLabels());
    expect(result.current.dayLabel("2026-10-06")).toBe("upcoming.today");
    expect(result.current.dayLabel("2026-10-07")).toBe("upcoming.tomorrow");

    jest.setSystemTime(new Date(2026, 9, 7, 8, 0));
    await rerender({});

    expect(result.current.dayLabel("2026-10-06")).toBe("upcoming.yesterday");
    expect(result.current.dayLabel("2026-10-07")).toBe("upcoming.today");
  });

  test("an episode that aired overnight stops reading as not yet aired", async () => {
    const episode = {
      Type: "Episode" as const,
      LocationType: "Virtual" as const,
      PremiereDate: "2026-10-07T00:00:00.000Z",
    };
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 23, 30) });
    const { result, rerender } = await renderHook(() => useEpisodeAirLabels());
    expect(result.current.availabilityLabel(episode)).toBe(
      "item_card.not_yet_aired",
    );

    jest.setSystemTime(new Date(2026, 9, 7, 8, 0));
    await rerender({});

    expect(result.current.availabilityLabel(episode)).toBe("item_card.missing");
  });

  // Callers memoize on these functions, so they only change with the day.
  test("the labels keep their identity within a day", async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 6, 9, 0) });
    const { result, rerender } = await renderHook(() => useEpisodeAirLabels());
    const first = result.current;

    jest.setSystemTime(new Date(2026, 9, 6, 21, 0));
    await rerender({});

    expect(result.current).toBe(first);
  });
});
