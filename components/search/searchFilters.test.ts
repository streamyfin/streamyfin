import { showSearchSort } from "@/components/search/searchFilters";

describe("showSearchSort", () => {
  // Both tabs sort their results now, so the tab has no say. On Discover,
  // gating the sort on the library search hid it whenever the same words had
  // been searched in the library first: those results stay cached.
  test("shows the sort once something is typed, on either tab", () => {
    expect(showSearchSort("dune")).toBe(true);
  });

  test("hides it until something is typed", () => {
    expect(showSearchSort("")).toBe(false);
  });
});
