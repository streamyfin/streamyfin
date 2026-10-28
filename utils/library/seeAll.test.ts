import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";
import { recentlyAddedSeeAllParams } from "./seeAll";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack; only the sort constants are used.
jest.mock("@/utils/atoms/settings", () => ({}));

describe("recentlyAddedSeeAllParams", () => {
  test("sorts a Shows row by its newest episode", () => {
    expect(recentlyAddedSeeAllParams("tvshows")).toEqual({
      sortBy: SortByOption.DateLastContentAdded,
      sortOrder: SortOrderOption.Descending,
    });
  });

  test.each(["movies", undefined, null] as const)(
    "sorts a %s row by date added",
    (collectionType) => {
      expect(recentlyAddedSeeAllParams(collectionType)).toEqual({
        sortBy: SortByOption.DateCreated,
        sortOrder: SortOrderOption.Descending,
      });
    },
  );
});
