import { ItemFilter } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { createStore } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import {
  FilterByPreferenceAtom,
  getFilterByPreference,
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
