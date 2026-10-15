import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  airDayKey,
  airDayOffset,
  episodeAvailability,
  formatAirDay,
  formatAirTime,
  groupByAirDay,
  nextUpcomingStartIndex,
} from "./upcomingEpisodes";

const episode = (id: string, premiereDate?: string): BaseItemDto => ({
  Id: id,
  Type: "Episode",
  PremiereDate: premiereDate,
});

// The suite runs in New York (test-utils/timeZone.ts), west of UTC, where a
// day stored as midnight UTC reads as the evening before.
describe("airDayKey", () => {
  test("keeps the day a provider gave, stored as midnight UTC", () => {
    expect(new Date("2026-10-06T00:00:00.0000000Z").getDate()).toBe(5);
    expect(airDayKey("2026-10-06T00:00:00.0000000Z")).toBe("2026-10-06");
  });

  test("reads a date written with a time in the device's time zone", () => {
    // Midnight of October 6 in New York, as an NFO parsed there is stored.
    expect(airDayKey("2026-10-06T04:00:00.0000000Z")).toBe("2026-10-06");
  });

  test("has no day without a date, or with a broken one", () => {
    expect(airDayKey(undefined)).toBeNull();
    expect(airDayKey("")).toBeNull();
    expect(airDayKey("not a date")).toBeNull();
  });
});

describe("groupByAirDay", () => {
  test("groups episodes by day, earliest first, in the server's order", () => {
    const groups = groupByAirDay([
      episode("a", "2026-10-06T00:00:00Z"),
      episode("b", "2026-10-06T00:00:00Z"),
      episode("c", "2026-10-08T00:00:00Z"),
    ]);
    expect(groups.map((g) => [g.day, g.items.map((item) => item.Id)])).toEqual([
      ["2026-10-06", ["a", "b"]],
      ["2026-10-08", ["c"]],
    ]);
  });

  test("lists an episode two pages both returned only once", () => {
    const groups = groupByAirDay([
      episode("a", "2026-10-06T00:00:00Z"),
      episode("a", "2026-10-06T00:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(1);
  });

  test("leaves out an episode with no day to list it under", () => {
    expect(groupByAirDay([episode("a"), { Type: "Episode" }])).toEqual([]);
  });
});

describe("air day and time labels", () => {
  // 23:30 in New York on October 5, already October 6 in UTC.
  const now = new Date("2026-10-06T03:30:00Z");

  test("counts days from the device's own today", () => {
    expect(airDayOffset("2026-10-04", now)).toBe(-1);
    expect(airDayOffset("2026-10-05", now)).toBe(0);
    expect(airDayOffset("2026-10-06", now)).toBe(1);
    // Across the end of daylight saving time, when a day lasts 25 hours.
    expect(airDayOffset("2026-11-02", now)).toBe(28);
  });

  test("writes the day out in the language asked", () => {
    expect(formatAirDay("2026-10-06", "en-US")).toBe("Tuesday, October 6");
    expect(formatAirDay("2026-10-06", "fr-FR")).toBe("mardi 6 octobre");
  });

  test("shows an air time in the device's clock format", () => {
    // Node separates the meridiem with a narrow no-break space.
    const plain = (time: string | null) => time?.replace(/\s/g, " ");
    expect(plain(formatAirTime("21:00", "en-US"))).toBe("9:00 PM");
    expect(plain(formatAirTime("9:00 pm", "en-US"))).toBe("9:00 PM");
    expect(plain(formatAirTime("12:30 AM", "en-US"))).toBe("12:30 AM");
    expect(formatAirTime("9:00 PM", "fr-FR")).toBe("21:00");
  });

  test("shows what the provider wrote when it is not a time of day", () => {
    expect(formatAirTime(" Fridays at nine ", "en-US")).toBe("Fridays at nine");
    expect(formatAirTime("25:00", "en-US")).toBe("25:00");
    expect(formatAirTime("", "en-US")).toBeNull();
    expect(formatAirTime(undefined, "en-US")).toBeNull();
  });
});

// `/Shows/Upcoming` answers with TotalRecordCount set to the size of the page
// (TvShowsController.GetUpcomingEpisodes), so the total cannot end the list.
describe("nextUpcomingStartIndex", () => {
  const page = (size: number) =>
    Array.from({ length: size }, (_, i) => episode(String(i)));

  test("asks for the next page after a full one", () => {
    expect(nextUpcomingStartIndex([page(25)], 25)).toBe(25);
    expect(nextUpcomingStartIndex([page(25), page(25)], 25)).toBe(50);
  });

  test("stops on a short page, an empty one, or none", () => {
    expect(nextUpcomingStartIndex([page(25), page(3)], 25)).toBeUndefined();
    expect(nextUpcomingStartIndex([page(25), page(0)], 25)).toBeUndefined();
    expect(nextUpcomingStartIndex([], 25)).toBeUndefined();
  });
});

describe("episodeAvailability", () => {
  const now = new Date("2026-10-05T16:00:00Z");
  const virtual = (premiereDate?: string): BaseItemDto => ({
    ...episode("v", premiereDate),
    LocationType: "Virtual",
  });

  test("an episode with a file is neither missing nor unaired", () => {
    expect(
      episodeAvailability(
        { ...episode("a", "2026-10-09T00:00:00Z"), LocationType: "FileSystem" },
        now,
      ),
    ).toBeNull();
    expect(episodeAvailability(undefined, now)).toBeNull();
  });

  test("a virtual episode is unaired until its day comes", () => {
    expect(episodeAvailability(virtual("2026-10-06T00:00:00Z"), now)).toBe(
      "unaired",
    );
  });

  test("a virtual episode is missing from its air day on, or with no date", () => {
    expect(episodeAvailability(virtual("2026-10-05T00:00:00Z"), now)).toBe(
      "missing",
    );
    expect(episodeAvailability(virtual("2020-01-01T00:00:00Z"), now)).toBe(
      "missing",
    );
    expect(episodeAvailability(virtual(), now)).toBe("missing");
  });

  test("only an episode is ever labelled", () => {
    expect(
      episodeAvailability({ Type: "Season", LocationType: "Virtual" }, now),
    ).toBeNull();
  });
});
