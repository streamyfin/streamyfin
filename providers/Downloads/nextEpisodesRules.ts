import { atom } from "jotai";
import { NEXT_EPISODES_RULES_KEY } from "@/constants/Downloads";
import { storage } from "@/utils/mmkv";

/** "Keep the next episodes of this series downloaded", set from the download sheet. */
export type NextEpisodesRule = {
  seriesId: string;
  /** Shown in the settings list, which has no server to ask when offline. */
  seriesName: string;
  count: number;
  deleteWatched: boolean;
  /**
   * The episodes this rule downloaded. Unless the user lets it delete any
   * download, these are the only ones it deletes once they are watched.
   */
  downloadedIds: string[];
};

/** Rules by user id, then by series id: a device can be shared by several users. */
export type NextEpisodesRules = Record<
  string,
  Record<string, NextEpisodesRule>
>;

const loadRules = (): NextEpisodesRules => {
  try {
    const stored = storage.getString(NEXT_EPISODES_RULES_KEY);
    return stored ? (JSON.parse(stored) as NextEpisodesRules) : {};
  } catch (error) {
    console.warn("[NextEpisodes] Could not read the series rules:", error);
    return {};
  }
};

const baseRulesAtom = atom<NextEpisodesRules>(loadRules());

/** Every user's rules. Writing it stores them. */
export const nextEpisodesRulesAtom = atom(
  (get) => get(baseRulesAtom),
  (get, set, update: (rules: NextEpisodesRules) => NextEpisodesRules): void => {
    const next = update(get(baseRulesAtom));
    storage.set(NEXT_EPISODES_RULES_KEY, JSON.stringify(next));
    set(baseRulesAtom, next);
  },
);

/** One user's rules, in the order their series were added. */
export const rulesOfUser = (
  rules: NextEpisodesRules,
  userId: string | undefined,
): NextEpisodesRule[] => (userId ? Object.values(rules[userId] ?? {}) : []);

export const withRule = (
  rules: NextEpisodesRules,
  userId: string,
  rule: NextEpisodesRule,
): NextEpisodesRules => ({
  ...rules,
  [userId]: { ...rules[userId], [rule.seriesId]: rule },
});

export const withoutRule = (
  rules: NextEpisodesRules,
  userId: string,
  seriesId: string,
): NextEpisodesRules => {
  const { [seriesId]: _removed, ...rest } = rules[userId] ?? {};
  return { ...rules, [userId]: rest };
};

/**
 * Records what a check downloaded and deleted for a series. A rule removed
 * while the check ran stays removed.
 */
export const withDownloadedIds = (
  rules: NextEpisodesRules,
  userId: string,
  seriesId: string,
  { added = [], removed = [] }: { added?: string[]; removed?: string[] },
): NextEpisodesRules => {
  const rule = rules[userId]?.[seriesId];
  if (!rule) return rules;
  const ids = new Set(rule.downloadedIds);
  for (const id of added) ids.add(id);
  for (const id of removed) ids.delete(id);
  return withRule(rules, userId, { ...rule, downloadedIds: [...ids] });
};
