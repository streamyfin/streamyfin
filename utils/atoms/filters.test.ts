import {
  ItemFilter,
  ItemSortBy,
} from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { createStore } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import {
  FilterByOption,
  FilterByPreferenceAtom,
  getFilterByPreference,
  officialRatingPreferenceAtom,
  SortByOption,
  useFilterOptions,
} from "./filters";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack; the filter options only read the
// Kefin Tweaks toggle from it.
jest.mock("./settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));

const mockSettings = { useKefinTweaks: false };

// The name the app sent until this was fixed. The server enum
// (MediaBrowser.Model/Querying/ItemFilter.cs) spells it IsFavoriteOrLikes, so
// the favourite-or-liked filter never reached it.
const MISSPELT_FILTER = "IsFavoriteOrLiked";

const STORAGE_KEY = "filterByPreference";

const offeredFilters = async (useKefinTweaks: boolean) => {
  mockSettings.useKefinTweaks = useKefinTweaks;
  const { result } = await renderHook(() => useFilterOptions());
  return result.current.map((option) => option.key as string);
};

// Mounting is what makes atomWithStorage read the stored value.
const readSavedPreferences = () => {
  const store = createStore();
  const unsubscribe = store.sub(FilterByPreferenceAtom, () => undefined);
  const preferences = store.get(FilterByPreferenceAtom);
  unsubscribe();
  return preferences;
};

beforeEach(() => {
  clearMmkv();
});

describe("the filter by options", () => {
  test.each([
    ["without Kefin Tweaks", false],
    ["with Kefin Tweaks", true],
  ])(
    "offers only filters the server knows, %s",
    async (_name, useKefinTweaks) => {
      const serverFilters: string[] = Object.values(ItemFilter);

      for (const filter of await offeredFilters(useKefinTweaks)) {
        expect(serverFilters).toContain(filter);
      }
    },
  );

  test("limits the choices to the kind's own list", async () => {
    mockSettings.useKefinTweaks = true;
    const { result } = await renderHook(() =>
      useFilterOptions([FilterByOption.IsUnplayed]),
    );

    // The Watchlist is the app's own, gated by the setting and not by the kind.
    expect(result.current.map((o) => o.key)).toEqual(["IsUnplayed", "Likes"]);
  });

  test("sends the favourite-or-liked filter under the server's spelling", async () => {
    const filters = await offeredFilters(false);

    expect(filters).toContain("IsFavoriteOrLikes");
    expect(filters).not.toContain(MISSPELT_FILTER);
  });
});

describe("the saved filter of a library", () => {
  test("comes back under the server's spelling when it was saved misspelt", () => {
    storage.set(
      STORAGE_KEY,
      JSON.stringify({ movies: MISSPELT_FILTER, shows: "IsUnplayed" }),
    );

    const preferences = readSavedPreferences();

    expect(getFilterByPreference("movies", preferences)).toBe(
      "IsFavoriteOrLikes",
    );
    // Every other saved filter was already spelt the server's way.
    expect(getFilterByPreference("shows", preferences)).toBe("IsUnplayed");
  });

  test("is written back under the server's spelling on the next save", () => {
    storage.set(STORAGE_KEY, JSON.stringify({ movies: MISSPELT_FILTER }));
    const store = createStore();
    const unsubscribe = store.sub(FilterByPreferenceAtom, () => undefined);

    // What the library screen does when another library picks a filter.
    store.set(FilterByPreferenceAtom, {
      ...store.get(FilterByPreferenceAtom),
      shows: "IsPlayed",
    });
    unsubscribe();

    expect(JSON.parse(storage.getString(STORAGE_KEY) ?? "")).toEqual({
      movies: "IsFavoriteOrLikes",
      shows: "IsPlayed",
    });
  });

  test("is empty when nothing was saved", () => {
    expect(readSavedPreferences()).toEqual({});
    expect(getFilterByPreference("movies", readSavedPreferences())).toBeNull();
  });

  test("is empty when the stored value is not a preference map", () => {
    storage.set(STORAGE_KEY, "null");

    expect(readSavedPreferences()).toEqual({});
  });
});

describe("sort options", () => {
  // The library screens send the chosen option to GET /Items as it is, so an
  // option the server does not know is a request it rejects.
  test("every option but the app's own Default is a server sort key", () => {
    const serverKeys: string[] = Object.values(ItemSortBy);

    for (const key of Object.values(SortByOption)) {
      if (key === SortByOption.Default) continue;
      expect(serverKeys).toContain(key);
    }
  });

  // The library page accepts a sortBy from its URL when it is a SortByOption
  // value, so the enum holds only keys a sort list can offer: the music keys
  // come with the music sort list.
  test("has no music sort keys before a list offers them", () => {
    expect(Object.values(SortByOption)).not.toContain("Album");
    expect(Object.values(SortByOption)).not.toContain("AlbumArtist");
    expect(Object.values(SortByOption)).not.toContain("Artist");
  });
});

describe("the saved official ratings of a library", () => {
  test("round-trip through storage under their own key", () => {
    const writer = createStore();
    writer.sub(officialRatingPreferenceAtom, () => undefined);
    writer.set(officialRatingPreferenceAtom, { movies: ["PG-13", "R"] });

    const reader = createStore();
    reader.sub(officialRatingPreferenceAtom, () => undefined);

    expect(reader.get(officialRatingPreferenceAtom)).toEqual({
      movies: ["PG-13", "R"],
    });
    expect(storage.getString("officialRatingPreference")).toBe(
      JSON.stringify({ movies: ["PG-13", "R"] }),
    );
  });
});
