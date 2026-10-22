import { SortByOption, sortOptionsFor } from "@/utils/atoms/filters";
import { resolveSortKey } from "./sortOption";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack; only the sort constants are used.
jest.mock("@/utils/atoms/settings", () => ({}));

describe("resolveSortKey", () => {
  test("keeps a key the shown list offers", () => {
    expect(
      resolveSortKey(SortByOption.PremiereDate, sortOptionsFor(undefined)),
    ).toBe(SortByOption.PremiereDate);
  });

  // The shared sort atom can hold the Shows-only key when a collection opens,
  // and the shared list has no label for it (an empty chip on TV).
  test("falls back to Name for a key carried over from a Shows library", () => {
    expect(
      resolveSortKey(
        SortByOption.DateLastContentAdded,
        sortOptionsFor(undefined),
      ),
    ).toBe(SortByOption.SortName);
  });

  test("keeps that key when the collection is itself a Shows view", () => {
    expect(
      resolveSortKey(
        SortByOption.DateLastContentAdded,
        sortOptionsFor("tvshows"),
      ),
    ).toBe(SortByOption.DateLastContentAdded);
  });

  test("falls back to Name when nothing is selected", () => {
    expect(resolveSortKey(undefined, sortOptionsFor("movies"))).toBe(
      SortByOption.SortName,
    );
  });
});
