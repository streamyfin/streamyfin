import { File, Paths } from "expo-file-system";
import { SAVED_SUBTITLES_CACHE_DIR } from "@/constants/Playback";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { isLocalSubtitleIndex, localSubtitlePosition } from "./subtitleIndex";

export interface SavedSubtitleFile {
  name: string;
  filePath: string;
}

const fileName = (uri: string): string => {
  const last = uri.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/**
 * The saved file by its name in today's cache: an app update on iOS and tvOS
 * moves the app's data to a new container, so the directory a path was saved
 * under can be gone while the file is still there.
 */
const savedFile = (filePath: string): File =>
  new File(Paths.cache, SAVED_SUBTITLES_CACHE_DIR, fileName(filePath));

/**
 * Subtitle files saved on this device for an item (OpenSubtitles downloads on
 * TV) that are still on disk, in the order the item page lists them: row k of
 * that list is `localSubtitleIndex(k)`.
 */
export const savedSubtitleFiles = (itemId: string): SavedSubtitleFile[] =>
  getSubtitlesForItem(itemId)
    .map(({ name, filePath }) => ({ name, file: savedFile(filePath) }))
    .filter(({ file }) => file.exists)
    .map(({ name, file }) => ({ name, filePath: file.uri }));

/**
 * The saved file a sidecar index picked: the file at `filePath` when the item
 * page passed it, else the row's position. Null for a server track, Off, a
 * row past the list, or a file gone since.
 */
export const savedSubtitleFor = (
  itemId: string,
  subtitleIndex: number | undefined,
  filePath?: string,
): SavedSubtitleFile | null => {
  if (!isLocalSubtitleIndex(subtitleIndex)) return null;
  const files = savedSubtitleFiles(itemId);
  if (filePath) {
    const name = fileName(filePath);
    return files.find((file) => fileName(file.filePath) === name) ?? null;
  }
  return files[localSubtitlePosition(subtitleIndex)] ?? null;
};
