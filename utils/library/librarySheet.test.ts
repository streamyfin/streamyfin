import {
  ALL_OPTION,
  filterSummary,
  tvLibrarySheetPlacement,
} from "./librarySheet";

const labels = { all: "All", count: (count: number) => `${count} selected` };
const option = (label: string, selected: boolean, value = label) => ({
  label,
  value,
  selected,
});

describe("tvLibrarySheetPlacement", () => {
  test("a sheet is at the bottom on Apple TV and on the right on Android TV", () => {
    expect(tvLibrarySheetPlacement("ios")).toBe("bottom");
    expect(tvLibrarySheetPlacement("android")).toBe("right");
  });
});

describe("filterSummary", () => {
  test("nothing picked reads as all", () => {
    expect(
      filterSummary(
        [option("All", true, ALL_OPTION), option("Drama", false)],
        labels,
      ),
    ).toBe("All");
    expect(filterSummary([], labels)).toBe("All");
  });

  test("one pick is named", () => {
    expect(
      filterSummary(
        [option("All", false, ALL_OPTION), option("Japanese (jpn)", true)],
        labels,
      ),
    ).toBe("Japanese (jpn)");
  });

  test("several picks are counted", () => {
    expect(
      filterSummary(
        [option("Drama", true), option("Comedy", true), option("War", false)],
        labels,
      ),
    ).toBe("2 selected");
  });
});
