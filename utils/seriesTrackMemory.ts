import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import type { TrackMenuRow } from "@/utils/subtitles/trackMenu";

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

/** The two toggles that gate writing — a subset of Settings, so callers can
 * pass the settings object straight through. */
export interface RememberTrackSettings {
  rememberAudioSelections?: boolean;
  rememberSubtitleSelections?: boolean;
}

/**
 * Persist a deliberate track pick as the series preference.
 *
 * Takes the menu row the user actually pressed rather than an index plus a
 * stream list. That difference matters: the row carries its own language, so
 * the write cannot consult a list that was refetched since the menu was built —
 * which is how a just-downloaded subtitle used to store nothing at all. It also
 * makes the inert rows unrepresentable rather than something each call site has
 * to remember to skip.
 *
 * Shared by every surface that lets the user choose a track. Memory only some
 * of them write is memory the user can't trust: picking English on the details
 * page and having the next episode come back Turkish is indistinguishable from
 * the feature being broken.
 */
export function rememberSeriesTrackFromRow(options: {
  item: BaseItemDto | null | undefined;
  kind: "audio" | "subtitle";
  row: Pick<TrackMenuRow, "kind" | "language">;
  settings: RememberTrackSettings | null | undefined;
}): void {
  const { item, kind, row, settings } = options;
  if (item?.Type !== "Episode" || !item.SeriesId) return;

  const enabled =
    kind === "audio"
      ? settings?.rememberAudioSelections
      : settings?.rememberSubtitleSelections;
  if (!enabled) return;

  // A sidecar has no server-side identity and a burned-in row is inert — there
  // is nothing about either that the next episode could act on.
  if (row.kind === "sidecar" || row.kind === "burnedIn") return;

  if (kind === "subtitle" && row.kind === "off") {
    rememberSeriesTrack(item.SeriesId, { subtitleLang: "off" });
    return;
  }
  if (row.kind !== "server") return;

  if (!row.language) {
    // A stream with no Language tag can't be matched in the next episode
    // (indexes don't carry over), so there is nothing worth storing. Logged
    // because from the outside this is indistinguishable from "not saved".
    writeInfoLog("Series track memory: stream has no language, not stored", {
      seriesId: item.SeriesId,
      kind,
    });
    return;
  }

  rememberSeriesTrack(
    item.SeriesId,
    kind === "audio"
      ? { audioLang: row.language }
      : { subtitleLang: row.language },
  );
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
