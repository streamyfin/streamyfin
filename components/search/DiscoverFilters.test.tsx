import { showDiscoverFilters } from "@/components/search/DiscoverFilters";

// The SwiftUI module does not load under Jest; only the visibility rule is
// under test here.
jest.mock("@expo/ui/swift-ui", () => ({}));
jest.mock("@expo/ui/swift-ui/modifiers", () => ({}));
jest.mock("@/components/seerr/SeerrIndexPage", () => ({
  SeerrSearchSort: {},
}));
jest.mock("@/components/filters/FilterButton", () => ({
  FilterButton: () => null,
}));

describe("showDiscoverFilters", () => {
  // The filters sort Seerr's results. Gating them on the library search hid
  // them whenever the same words had been searched in the library first,
  // because those results stay cached while the Discover tab is open.
  test("shows the filters for a Discover search, whatever the library found", () => {
    expect(showDiscoverFilters("Discover", "dune")).toBe(true);
  });

  test("hides them until something is typed", () => {
    expect(showDiscoverFilters("Discover", "")).toBe(false);
  });

  test("hides them on the Library tab", () => {
    expect(showDiscoverFilters("Library", "dune")).toBe(false);
  });
});
