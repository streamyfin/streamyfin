import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import {
  filterByAtom,
  filterOwnerAtom,
  genreFilterAtom,
  SortByOption,
  SortOrderOption,
  sortByAtom,
  sortOrderAtom,
  tagsFilterAtom,
  yearFilterAtom,
} from "@/utils/atoms/filters";
import { useLibraryFilters } from "./useLibraryFilters";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// settings.ts drags in the provider stack, and nothing here reads a setting.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));

const MOVIES = "f137a2dd21bbc1b99aa5c0f6bf02a805";
const SHOWS = "a656b907eb3a73532e40e44b968d0225";

type Store = ReturnType<typeof createStore>;

const renderFilters = async (store: Store, screenId: string) =>
  renderHook(() => useLibraryFilters(screenId), {
    wrapper: ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    ),
  });

// What a library screen does on focus: write its own selection into the
// shared atoms and put its name on them.
const claim = (
  store: Store,
  screenId: string,
  selection: { years?: string[]; sortBy?: SortByOption } = {},
) => {
  store.set(genreFilterAtom, []);
  store.set(yearFilterAtom, selection.years ?? []);
  store.set(tagsFilterAtom, []);
  store.set(sortByAtom, [selection.sortBy ?? SortByOption.SortName]);
  store.set(sortOrderAtom, [SortOrderOption.Ascending]);
  store.set(filterByAtom, []);
  store.set(filterOwnerAtom, screenId);
};

describe("the filters a library screen queries with", () => {
  // The first library opened in a session rendered with the atoms' initial
  // values and fetched with them (sortBy=Default, a sort nobody chose) before
  // its focus effect had applied its own.
  test("holds nothing before the screen has claimed the shared filters", async () => {
    const { result } = await renderFilters(createStore(), MOVIES);

    expect(result.current).toBeNull();
  });

  // Seen on the wire: Shows opened after Movies asked the server for Shows
  // from 2019, Movies' saved year, next to its own request.
  test("holds nothing while the shared filters still describe another library", async () => {
    const store = createStore();
    claim(store, MOVIES, { years: ["2019"] });

    const { result } = await renderFilters(store, SHOWS);

    expect(result.current).toBeNull();
  });

  test("gives the screen its filters once it has claimed them", async () => {
    const store = createStore();
    claim(store, MOVIES, { years: ["2019"] });
    const { result } = await renderFilters(store, SHOWS);

    await act(async () => claim(store, SHOWS, { sortBy: SortByOption.Random }));

    expect(result.current).toEqual({
      genres: [],
      years: [],
      tags: [],
      sortBy: [SortByOption.Random],
      sortOrder: [SortOrderOption.Ascending],
      filterBy: [],
    });
  });

  test("follows a change made while the screen holds them", async () => {
    const store = createStore();
    const { result } = await renderFilters(store, MOVIES);
    await act(async () => claim(store, MOVIES));

    await act(async () => store.set(yearFilterAtom, ["1999"]));

    expect(result.current?.years).toEqual(["1999"]);
  });

  // The stack keeps a library mounted under the one opened on top of it, and
  // the one on top overwrites the shared atoms.
  test("keeps its own filters when another screen takes the shared ones over", async () => {
    const store = createStore();
    const { result } = await renderFilters(store, MOVIES);
    await act(async () => claim(store, MOVIES, { years: ["2019"] }));
    const own = result.current;

    await act(async () => claim(store, SHOWS, { sortBy: SortByOption.Random }));

    expect(result.current).toBe(own);
    expect(result.current?.years).toEqual(["2019"]);
  });

  // A second visit to a library is a new screen. While the first visit's name
  // stayed on the atoms, the second read them at once: after a "See all"
  // visit, with that visit's sort, ahead of its own.
  test("lets go of the shared filters when the screen goes away", async () => {
    const store = createStore();
    const firstVisit = await renderFilters(store, MOVIES);
    await act(async () =>
      claim(store, MOVIES, { sortBy: SortByOption.DateCreated }),
    );

    await firstVisit.unmount();
    const { result } = await renderFilters(store, MOVIES);

    expect(store.get(filterOwnerAtom)).toBeNull();
    expect(result.current).toBeNull();
  });

  test("leaves them with a screen that claimed them since", async () => {
    const store = createStore();
    const movies = await renderFilters(store, MOVIES);
    await act(async () => claim(store, MOVIES));
    const shows = await renderFilters(store, SHOWS);
    await act(async () => claim(store, SHOWS, { years: ["2020"] }));

    await movies.unmount();

    expect(store.get(filterOwnerAtom)).toBe(SHOWS);
    expect(shows.result.current?.years).toEqual(["2020"]);
  });

  test("hands the filters back unchanged across a render that changed nothing", async () => {
    const store = createStore();
    const { result, rerender } = await renderFilters(store, MOVIES);
    await act(async () => claim(store, MOVIES));
    const first = result.current;

    await rerender({});

    expect(result.current).toBe(first);
  });
});
