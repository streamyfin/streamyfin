/**
 * The newest progress of each download, with the native task it came from.
 *
 * Written by the progress handler as each event lands, read where a download is paused (by the
 * user, or by native after a lost connection). Both run after an await or in another listener, so
 * the progress they could see through `processes` is only as new as the last render, and a pause
 * saved from it can persist an older percentage. Keyed by task as well as item: a resumed task
 * starts with no progress of its own, and the previous task's bytes may have been discarded.
 */
type CachedProgress = {
  taskId: number;
  progress: number;
  bytesDownloaded: number;
  estimatedTotalSizeBytes?: number;
};

const latest = new Map<string, CachedProgress>();

export function rememberProgress(itemId: string, entry: CachedProgress): void {
  latest.set(itemId, entry);
}

/** The newest progress of `itemId`, if it came from `taskId`. */
export function latestProgress(
  itemId: string,
  taskId: number | undefined,
): CachedProgress | undefined {
  const entry = latest.get(itemId);
  return entry && taskId !== undefined && entry.taskId === taskId
    ? entry
    : undefined;
}

export function forgetProgress(itemId: string): void {
  latest.delete(itemId);
}
