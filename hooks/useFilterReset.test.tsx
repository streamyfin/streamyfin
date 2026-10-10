import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";
import {
  audioLanguageFilterAtom,
  audioLanguagePreferenceAtom,
  SortByOption,
  sortByAtom,
  subtitleLanguageFilterAtom,
  subtitleLanguagePreferenceAtom,
} from "@/utils/atoms/filters";
import { useFilterReset } from "./useFilterReset";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack and the reset reads none of it.
jest.mock("@/utils/atoms/settings", () => ({ useSettings: () => ({}) }));

// A library screen puts its sort on the baseline when it gains focus; the
// atom's own default counts as a changed sort.
const libraryStore = () => {
  const store = createStore();
  store.set(sortByAtom, [SortByOption.SortName]);
  return store;
};

const renderReset = async (store: ReturnType<typeof createStore>) => {
  const { result } = await renderHook(() => useFilterReset("movies"), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    ),
  });
  return result;
};

beforeEach(() => {
  clearMmkv();
});

test.each([
  ["an audio language", audioLanguageFilterAtom],
  ["a subtitle language", subtitleLanguageFilterAtom],
])("shows the reset once %s is selected", async (_name, filterAtom) => {
  const store = libraryStore();
  const result = await renderReset(store);
  expect(result.current.hasActiveFilters).toBe(false);

  await act(async () => store.set(filterAtom, ["eng"]));

  expect(result.current.hasActiveFilters).toBe(true);
});

test("a reset clears the language filters and what the library remembered", async () => {
  const store = libraryStore();
  store.set(audioLanguageFilterAtom, ["eng"]);
  store.set(subtitleLanguageFilterAtom, ["swe"]);
  store.set(audioLanguagePreferenceAtom, { movies: ["eng"], shows: ["jpn"] });
  store.set(subtitleLanguagePreferenceAtom, { movies: ["swe"] });
  const result = await renderReset(store);

  await act(async () => result.current.resetAllFilters());

  expect(store.get(audioLanguageFilterAtom)).toEqual([]);
  expect(store.get(subtitleLanguageFilterAtom)).toEqual([]);
  // Otherwise the next visit restores the selection the reset just cleared.
  // Another library's memory is not this reset's to forget.
  expect(store.get(audioLanguagePreferenceAtom)).toEqual({ shows: ["jpn"] });
  expect(store.get(subtitleLanguagePreferenceAtom)).toEqual({});
  expect(result.current.hasActiveFilters).toBe(false);
});
