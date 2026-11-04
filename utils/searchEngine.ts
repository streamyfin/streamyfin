import type { Settings } from "@/utils/atoms/settings";

/**
 * Whether Streamystats answers the person's searches, which leaves the Marlin switch nothing
 * to choose. Read from the engine itself rather than from a Streamystats address being set:
 * an administrator can set Streamystats up for its other pages and keep Jellyfin search.
 */
export const streamystatsAnswersSearch = (
  settings: Pick<Settings, "searchEngine"> | null | undefined,
): boolean => settings?.searchEngine === "Streamystats";
