import { fireEvent, render, screen } from "@testing-library/react-native";
import { createStore, Provider } from "jotai";
import { clearMmkv } from "@/test-utils/mmkv";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
const mockRunNextEpisodesCheck = jest.fn();
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ runNextEpisodesCheck: mockRunNextEpisodesCheck }),
}));
const mockSettings = {
  nextEpisodesDownloadCount: 5,
  nextEpisodesDeleteAnyDownload: false,
};
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "user-1" }) };
});

import {
  nextEpisodesRulesAtom,
  withRule,
} from "@/providers/Downloads/nextEpisodesRules";
import { NextEpisodesRuleControls } from "./NextEpisodesRuleControls";

const KEEP = "item_card.download.keep_next_episodes";
const DELETE_WATCHED = "item_card.download.delete_watched_episodes";

const renderControls = async (store = createStore()) => {
  await render(
    <Provider store={store}>
      <NextEpisodesRuleControls seriesId='series-1' seriesName='Show' />
    </Provider>,
  );
  return store;
};

const storedRule = (store: ReturnType<typeof createStore>) =>
  store.get(nextEpisodesRulesAtom)["user-1"]?.["series-1"];

beforeEach(() => {
  clearMmkv();
  jest.clearAllMocks();
});

describe("NextEpisodesRuleControls", () => {
  test("is off for a series without a rule", async () => {
    await renderControls();

    expect(screen.getByLabelText(KEEP).props.value).toBe(false);
    expect(screen.queryByLabelText(DELETE_WATCHED)).toBeNull();
  });

  test("turning it on keeps the default count and checks at once", async () => {
    const store = await renderControls();

    await fireEvent(screen.getByLabelText(KEEP), "valueChange", true);

    expect(storedRule(store)).toEqual({
      seriesId: "series-1",
      seriesName: "Show",
      count: 5,
      deleteWatched: false,
      downloadedIds: [],
    });
    expect(mockRunNextEpisodesCheck).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(DELETE_WATCHED)).toBeTruthy();
  });

  // The check that ran since the sheet opened recorded what it downloaded;
  // a change from the sheet must not forget those episodes.
  test("a new count keeps the episodes the rule downloaded", async () => {
    const store = createStore();
    store.set(nextEpisodesRulesAtom, (rules) =>
      withRule(rules, "user-1", {
        seriesId: "series-1",
        seriesName: "Show",
        count: 3,
        deleteWatched: false,
        downloadedIds: ["e2", "e3"],
      }),
    );
    await renderControls(store);

    await fireEvent.press(
      screen.getByLabelText("item_card.download.next_episodes_count_option:10"),
    );

    expect(storedRule(store)).toMatchObject({
      count: 10,
      downloadedIds: ["e2", "e3"],
    });
    expect(mockRunNextEpisodesCheck).toHaveBeenCalled();
  });

  test("deleting watched episodes is saved with the rule", async () => {
    const store = await renderControls();
    await fireEvent(screen.getByLabelText(KEEP), "valueChange", true);

    await fireEvent(screen.getByLabelText(DELETE_WATCHED), "valueChange", true);

    expect(storedRule(store)?.deleteWatched).toBe(true);
  });

  test("turning it off removes the rule", async () => {
    const store = await renderControls();
    await fireEvent(screen.getByLabelText(KEEP), "valueChange", true);

    await fireEvent(screen.getByLabelText(KEEP), "valueChange", false);

    expect(storedRule(store)).toBeUndefined();
  });
});
