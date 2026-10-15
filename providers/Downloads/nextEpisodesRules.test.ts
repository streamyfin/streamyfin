import { createStore } from "jotai";
import { NEXT_EPISODES_RULES_KEY } from "@/constants/Downloads";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import {
  type NextEpisodesRule,
  nextEpisodesRulesAtom,
  rulesOfUser,
  withDownloadedIds,
  withoutRule,
  withRule,
} from "./nextEpisodesRules";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const rule = (seriesId: string, downloadedIds: string[] = []) =>
  ({
    seriesId,
    seriesName: seriesId,
    count: 3,
    deleteWatched: false,
    downloadedIds,
  }) satisfies NextEpisodesRule;

beforeEach(clearMmkv);

describe("series rules", () => {
  test("are kept per user", () => {
    let rules = withRule({}, "alice", rule("series-1"));
    rules = withRule(rules, "bob", rule("series-2"));

    expect(rulesOfUser(rules, "alice").map((r) => r.seriesId)).toEqual([
      "series-1",
    ]);
    expect(rulesOfUser(rules, "bob").map((r) => r.seriesId)).toEqual([
      "series-2",
    ]);
    expect(rulesOfUser(rules, undefined)).toEqual([]);
  });

  test("removes one series and keeps the others", () => {
    let rules = withRule({}, "alice", rule("series-1"));
    rules = withRule(rules, "alice", rule("series-2"));

    rules = withoutRule(rules, "alice", "series-1");

    expect(rulesOfUser(rules, "alice").map((r) => r.seriesId)).toEqual([
      "series-2",
    ]);
  });

  test("records what a check downloaded and deleted", () => {
    const rules = withRule({}, "alice", rule("series-1", ["e1", "e2"]));

    const next = withDownloadedIds(rules, "alice", "series-1", {
      added: ["e3"],
      removed: ["e1"],
    });

    expect(next.alice["series-1"].downloadedIds).toEqual(["e2", "e3"]);
  });

  // The rule was stopped from the settings while a check was downloading.
  test("does not bring back a rule removed while a check ran", () => {
    const next = withDownloadedIds({}, "alice", "series-1", { added: ["e1"] });
    expect(rulesOfUser(next, "alice")).toEqual([]);
  });

  test("are stored when written", () => {
    const store = createStore();

    store.set(nextEpisodesRulesAtom, (rules) =>
      withRule(rules, "alice", rule("series-1")),
    );

    expect(
      JSON.parse(storage.getString(NEXT_EPISODES_RULES_KEY) ?? "{}"),
    ).toEqual({ alice: { "series-1": rule("series-1") } });
  });
});
