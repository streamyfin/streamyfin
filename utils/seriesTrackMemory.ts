import { storage } from "@/utils/mmkv";

/**
 * Per-series audio/subtitle preference, written when a track is deliberately
 * picked inside the player and read by getDefaultPlaySettings when a fresh
 * session of the same series starts. Stored by language (not stream index)
 * because indexes differ between episode files.
 */
export interface SeriesTrackMemory {
  /** ISO 639-2 code of the last audio track picked. */
  audioLang?: string;
  /** ISO 639-2 code of the last subtitle picked, or "off" for subtitles off. */
  subtitleLang?: string;
  updatedAt: number;
}

const STORAGE_KEY = "seriesTrackMemory.v1";
const MAX_SERIES = 100;

type MemoryMap = Record<string, SeriesTrackMemory>;

function readAll(): MemoryMap {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MemoryMap;
  } catch {
    return {};
  }
}

export function getSeriesTrackMemory(
  seriesId: string,
): SeriesTrackMemory | undefined {
  return readAll()[seriesId];
}

export function rememberSeriesTrack(
  seriesId: string,
  patch: { audioLang?: string; subtitleLang?: string },
): void {
  const all = readAll();
  all[seriesId] = { ...all[seriesId], ...patch, updatedAt: Date.now() };
  const ids = Object.keys(all);
  if (ids.length > MAX_SERIES) {
    const oldest = ids
      .sort((a, b) => (all[a].updatedAt ?? 0) - (all[b].updatedAt ?? 0))
      .slice(0, ids.length - MAX_SERIES);
    for (const id of oldest) {
      delete all[id];
    }
  }
  storage.set(STORAGE_KEY, JSON.stringify(all));
}
