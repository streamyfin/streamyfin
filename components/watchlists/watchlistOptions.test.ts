import type { TFunction } from "i18next";
import {
  watchlistItemTypes,
  watchlistSortOptions,
  watchlistTypeLabel,
} from "@/components/watchlists/watchlistOptions";

// The key stands for its translation.
const t = ((key: string) => key) as unknown as TFunction;

// The labels were English strings in each screen, whatever the app's language.
describe("watchlist options", () => {
  test("offer every content type, translated", () => {
    expect(watchlistItemTypes(t)).toEqual([
      { value: null, label: "watchlists.all_types" },
      { value: "Movie", label: "watchlists.movies_only" },
      { value: "Series", label: "watchlists.series_only" },
      { value: "Episode", label: "watchlists.episodes_only" },
    ]);
  });

  test("offer every sort order, translated", () => {
    expect(watchlistSortOptions(t)).toEqual([
      { value: "custom", label: "watchlists.sort_custom" },
      { value: "name", label: "watchlists.sort_name" },
      { value: "dateAdded", label: "watchlists.sort_date_added" },
      { value: "releaseDate", label: "watchlists.sort_release_date" },
    ]);
  });

  // The list and the add to watchlist sheet showed the server's value, "Movie".
  test("name a watchlist's content type as the options do", () => {
    expect(watchlistTypeLabel(t, "Movie")).toBe("watchlists.movies_only");
    expect(watchlistTypeLabel(t, "Episode")).toBe("watchlists.episodes_only");
  });

  test("keep a type the app has no label for, and nothing for no type", () => {
    expect(watchlistTypeLabel(t, "MusicAlbum")).toBe("MusicAlbum");
    expect(watchlistTypeLabel(t, undefined)).toBeUndefined();
  });
});
