import { File } from "expo-file-system";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { isLocalSubtitleIndex, localSubtitlePosition } from "./subtitleIndex";

export interface SavedSubtitleFile {
  name: string;
  filePath: string;
}

/**
 * Subtitle files saved on this device for an item (OpenSubtitles downloads on
 * TV) that are still on disk, in the order the item page lists them: row k of
 * that list is `localSubtitleIndex(k)`.
 */
export const savedSubtitleFiles = (itemId: string): SavedSubtitleFile[] =>
  getSubtitlesForItem(itemId)
    .filter((subtitle) => new File(subtitle.filePath).exists)
    .map(({ name, filePath }) => ({ name, filePath }));

/** The saved file a subtitle index points at; null for a server track, Off, or a row past the list. */
export const savedSubtitleFor = (
  itemId: string,
  subtitleIndex: number | undefined,
): SavedSubtitleFile | null =>
  isLocalSubtitleIndex(subtitleIndex)
    ? (savedSubtitleFiles(itemId)[localSubtitlePosition(subtitleIndex)] ?? null)
    : null;
