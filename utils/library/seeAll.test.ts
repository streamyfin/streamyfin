import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";
import { recentlyAddedSeeAllParams } from "./seeAll";

// settings.ts drags in the provider stack; only the sort constants are used.

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
