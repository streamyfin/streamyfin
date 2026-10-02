import type {
  BaseItemDto,
  MediaStream,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client";
import {
  TRACK_MEMORY_MAX_ENTRIES,
  TRACK_MEMORY_STORAGE_KEY,
} from "@/constants/Playback";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import type { TrackMenuRow } from "@/utils/subtitles/trackMenu";

/** Identity of a selected audio or subtitle stream, without server paths or URLs. */
export interface RememberedTrack {
  /** Version whose stream indexes the snapshot uses. */
  mediaSourceId?: string;
  /** Metadata used to distinguish same-language tracks across files. */
  stream: MediaStream;
}

/** Local identities for offline replay and equivalent tracks in new episodes. */
export interface TrackSelectionMemory {
  /** Selected soundtrack, including title and channel metadata. */
  audio?: RememberedTrack;
  /** Selected subtitle, or an explicit disabled selection. */
  subtitle?: RememberedTrack | "off";
  /** Last deliberate change, used for bounded-cache eviction. */
  updatedAt: number;
}

/** Per-kind switches mirrored from the Jellyfin user profile. */
export interface RememberTrackSettings {
  /** Remember soundtrack selections. */
  rememberAudioSelections?: boolean;
  /** Remember subtitle selections, including off. */
  rememberSubtitleSelections?: boolean;
}

/** Cached selections keyed by the item or series ID. */
type MemoryMap = Record<string, TrackSelectionMemory>;

/** Scope selections by Jellyfin's stable server and user identifiers. */
export function getTrackMemoryScope(
  user: UserDto | null | undefined,
): string | undefined {
  if (!user?.ServerId || !user.Id) return undefined;
  return `${user.ServerId}:${user.Id}`;
}

/** Read a scoped cache; old unscoped entries cannot safely be assigned to an account. */
function readAll(scope: string, collection: "item" | "series"): MemoryMap {
  const raw = storage.getString(
    `${TRACK_MEMORY_STORAGE_KEY}:${scope}:${collection}`,
  );
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid track memory cache");
    }
    return parsed as MemoryMap;
  } catch (error) {
    writeErrorLog("Unable to read track selection memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

/** Read equivalent-track preferences for new episodes in this account. */
export function getSeriesTrackMemory(
  seriesId: string,
  scope?: string,
): TrackSelectionMemory | undefined {
  return scope ? readAll(scope, "series")[seriesId] : undefined;
}

/** Read a video's local identity cache for offline playback, not online defaults. */
export function getItemTrackMemory(
  itemId: string,
  scope?: string,
): TrackSelectionMemory | undefined {
  return scope ? readAll(scope, "item")[itemId] : undefined;
}

/**
 * Capture the actual pressed row for either track kind. Jellyfin owns online
 * replay defaults; these snapshots are used offline and across new episodes.
 */
export function rememberTrackSelectionFromRow(options: {
  /** Video whose menu the user opened. */
  item: BaseItemDto | null | undefined;
  /** Kind of selection being remembered. */
  kind: "audio" | "subtitle";
  /** Pressed row carrying its original stream metadata. */
  row: Pick<TrackMenuRow, "kind" | "index" | "stream">;
  /** Selected version; defaults to the item's first media source. */
  mediaSourceId?: string;
  /** Stable authenticated account scope. */
  memoryScope?: string;
  /** Per-kind opt-in settings. */
  settings: RememberTrackSettings | null | undefined;
}): void {
  const { item, kind, row, settings, memoryScope } = options;
  if (!item || row.kind === "sidecar" || row.kind === "burnedIn") return;
  const enabled =
    kind === "audio"
      ? settings?.rememberAudioSelections
      : settings?.rememberSubtitleSelections;
  if (!enabled) return;
  if (!memoryScope) {
    writeErrorLog("Cannot remember a track without an authenticated account");
    return;
  }

  let selection: RememberedTrack | "off";
  if (kind === "subtitle" && row.kind === "off") {
    selection = "off";
  } else {
    if (row.kind !== "server" || !row.stream) {
      writeErrorLog("Cannot remember a track without its stream metadata", {
        itemId: item.Id,
        kind,
      });
      return;
    }
    const stream = row.stream;
    selection = {
      mediaSourceId:
        options.mediaSourceId ?? item.MediaSources?.[0]?.Id ?? undefined,
      stream: {
        Index: row.index,
        Type: kind === "audio" ? "Audio" : "Subtitle",
        Language: stream.Language,
        Title: stream.Title,
        DisplayTitle: stream.DisplayTitle,
        Codec: stream.Codec,
        Profile: stream.Profile,
        Channels: stream.Channels,
        ChannelLayout: stream.ChannelLayout,
        IsForced: stream.IsForced === true,
        IsHearingImpaired: stream.IsHearingImpaired === true,
        IsExternal: stream.IsExternal === true,
      },
    };
  }
  const patch = { [kind]: selection };
  if (item.Id) writeMemory(memoryScope, "item", item.Id, patch);
  if (item.Type === "Episode" && item.SeriesId) {
    writeMemory(memoryScope, "series", item.SeriesId, patch);
  }
}

/** Merge the changed kind into a bounded cache without clearing the other selection. */
function writeMemory(
  scope: string,
  collection: "item" | "series",
  id: string,
  patch: Partial<Omit<TrackSelectionMemory, "updatedAt">>,
): void {
  const all = readAll(scope, collection);
  all[id] = { ...all[id], ...patch, updatedAt: Date.now() };
  const ids = Object.keys(all);
  if (ids.length > TRACK_MEMORY_MAX_ENTRIES) {
    const oldest = ids
      .sort((a, b) => all[a].updatedAt - all[b].updatedAt)
      .slice(0, ids.length - TRACK_MEMORY_MAX_ENTRIES);
    for (const old of oldest) delete all[old];
  }
  storage.set(
    `${TRACK_MEMORY_STORAGE_KEY}:${scope}:${collection}`,
    JSON.stringify(all),
  );
}
