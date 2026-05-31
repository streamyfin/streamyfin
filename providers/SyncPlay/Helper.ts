/**
 * SyncPlay Helper
 *
 * Utility functions for SyncPlay functionality.
 * Based on jellyfin-web's Helper.js
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getItemsApi,
  getTvShowsApi,
  getUserApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { TicksPerMillisecond } from "./types";

/**
 * Wait for an event to be triggered, with optional timeout.
 */
export function waitForEvent<T>(
  eventEmitter: {
    addEventListener: (event: string, handler: (data: T) => void) => void;
    removeEventListener: (event: string, handler: (data: T) => void) => void;
  },
  eventType: string,
  timeout?: number,
  rejectEvents?: string[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      eventEmitter.removeEventListener(eventType, handler);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (rejectEvents) {
        for (const event of rejectEvents) {
          eventEmitter.removeEventListener(event, rejectHandler);
        }
      }
    };

    const handler = (data: T) => {
      cleanup();
      resolve(data);
    };

    const rejectHandler = () => {
      cleanup();
      reject(new Error("Rejected by event"));
    };

    eventEmitter.addEventListener(eventType, handler);

    if (rejectEvents) {
      for (const event of rejectEvents) {
        eventEmitter.addEventListener(event, rejectHandler);
      }
    }

    if (timeout) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for event"));
      }, timeout);
    }
  });
}

/**
 * Wait for a promise-based callback, with timeout.
 */
export function waitWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Operation timed out"));
    }, timeout);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Convert ticks to milliseconds.
 */
export function ticksToMs(ticks: number): number {
  return ticks / TicksPerMillisecond;
}

/**
 * Convert milliseconds to ticks.
 */
export function msToTicks(ms: number): number {
  return Math.round(ms * TicksPerMillisecond);
}

/**
 * Convert a GUID string to standard format.
 */
export function stringToGuid(input: string): string {
  return input.replace(
    /([0-z]{8})([0-z]{4})([0-z]{4})([0-z]{4})([0-z]{12})/,
    "$1-$2-$3-$4-$5",
  );
}

/**
 * Parse a date string to Date object.
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Get current time as ISO string for API requests.
 */
export function nowAsIsoString(): string {
  return new Date().toISOString();
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simple event emitter for internal use.
 */
export class EventEmitter {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/**
 * Wait for the next emission of an event on our internal {@link EventEmitter},
 * or reject after `timeoutMs`. Auto-cleans the listener.
 */
export function waitForOwnEvent(
  emitter: EventEmitter,
  event: string,
  timeoutMs = 5000,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const handler = (...args: unknown[]) => {
      clearTimeout(timer);
      emitter.off(event, handler);
      resolve(args);
    };
    const timer = setTimeout(() => {
      emitter.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    emitter.on(event, handler);
  });
}

// ============================================================================
// Item fetching / queue translation
//
// Faithful port of jellyfin-web's `getItemsForPlayback` and
// `translateItemsForPlayback` from `src/plugins/syncPlay/core/Helper.js`.
//
// Why this matters for SyncPlay:
//  - The server takes the queue we send via `syncPlaySetNewQueue` and
//    broadcasts it verbatim to every group member. If we send a Series /
//    Season / BoxSet ID, every receiver tries to load that container as a
//    playable item, which silently fails on jellyfin-web (it never opens
//    the player). Sending an Episode ID without sibling expansion breaks
//    next-episode auto-advance for everyone in the group.
//  - jellyfin-web's `playbackManager.play` runs the same translation
//    locally; SyncPlay's `Controller.play` runs it before the SetNewQueue
//    request so the broadcast carries real playable item IDs.
//  - We replicate the same translation here so a mobile sender produces
//    the same broadcast a jellyfin-web sender would.
// ============================================================================

/** Options bag accepted by `translateItemsForPlayback`. */
export interface TranslateOptions {
  ids?: string[];
  shuffle?: boolean;
  queryOptions?: Record<string, unknown>;
}

/** Fields jellyfin-web requests for any playback queue. */
const PLAYBACK_FIELDS = ["Chapters", "Trickplay"] as const;

/** Resolve the current user. Cached only for the duration of one call. */
async function getCurrentUser(api: Api) {
  const user = (await getUserApi(api).getCurrentUser()).data;
  if (!user?.Id) {
    throw new Error("SyncPlay Helper: no authenticated user");
  }
  return user;
}

/**
 * Generic `getItems` wrapper with the playback defaults jellyfin-web uses
 * (`Chapters,Trickplay` fields, `ExcludeLocationTypes: Virtual`,
 * `CollapseBoxSetItems: false`, `EnableTotalRecordCount: false`, `Limit: 300`).
 *
 * Callers pass camelCase params straight to the SDK — no PascalCase shim.
 */
async function queryItems(
  api: Api,
  userId: string,
  params: Record<string, unknown>,
): Promise<BaseItemDto[]> {
  const res = await getItemsApi(api).getItems({
    limit: 300,
    fields: PLAYBACK_FIELDS as unknown as never,
    excludeLocationTypes: ["Virtual"] as unknown as never,
    enableTotalRecordCount: false,
    collapseBoxSetItems: false,
    ...params,
    userId,
  });
  return res.data.Items ?? [];
}

/**
 * Recursive "fetch children/tracks under X" — the shape MusicArtist /
 * MusicGenre / Photo / PhotoAlbum / IsFolder all share.
 */
function fetchSiblings(
  api: Api,
  userId: string,
  params: Record<string, unknown>,
): Promise<BaseItemDto[]> {
  return queryItems(api, userId, {
    filters: ["IsNotFolder"],
    recursive: true,
    ...params,
  });
}

/**
 * Resolve item IDs into full `BaseItemDto`s.
 * Mirrors jellyfin-web's `Helper.getItemsForPlayback`:
 *  - single ID → `getUserLibraryApi.getItem` (cheap)
 *  - multi ID → `getItemsApi.getItems` with playback defaults
 */
export async function getItemsForPlayback(
  api: Api,
  ids: string[],
): Promise<BaseItemDto[]> {
  if (!ids.length) return [];
  const userId = (await getCurrentUser(api)).Id as string;
  if (ids.length === 1) {
    const res = await getUserLibraryApi(api).getItem({
      userId,
      itemId: ids[0],
    });
    return res.data ? [res.data] : [];
  }
  return queryItems(api, userId, { ids });
}

/**
 * Expand a "first item" into a real playable queue.
 *
 * Mirrors jellyfin-web's `Helper.translateItemsForPlayback`:
 *  - Program → channel items
 *  - Playlist → playlist children
 *  - MusicArtist → artist tracks
 *  - MusicGenre → genre tracks
 *  - Photo / PhotoAlbum → sibling photos
 *  - IsFolder (Series, Season, BoxSet, MusicAlbum, ...) → recursive descendants
 *  - single Episode w/ `EnableNextEpisodeAutoPlay` → remaining series episodes
 *  - anything else → passthrough (Movies, Audio, single Episodes when autoplay off)
 *
 * Preserves the original `options.ids` order so the receiver sees the same
 * queue order the sender intended.
 */
export async function translateItemsForPlayback(
  api: Api,
  items: BaseItemDto[],
  options: TranslateOptions = {},
): Promise<BaseItemDto[]> {
  if (!items.length) return [];

  const workingItems =
    items.length > 1 && options.ids
      ? [...items].sort(
          (a, b) =>
            (options.ids ?? []).indexOf(a.Id ?? "") -
            (options.ids ?? []).indexOf(b.Id ?? ""),
        )
      : items;

  const firstItem = workingItems[0];
  const defaultSortBy = options.shuffle ? "Random" : "SortName";

  // Program → channel's playable items. Doesn't need a user lookup.
  if (firstItem.Type === "Program" && firstItem.ChannelId) {
    return getItemsForPlayback(api, [firstItem.ChannelId]);
  }

  // Resolve the user once for every branch that follows. Saves 1-2 round
  // trips vs. each helper resolving independently.
  const user = await getCurrentUser(api);
  const userId = user.Id as string;

  if (firstItem.Type === "Playlist") {
    return queryItems(api, userId, {
      parentId: firstItem.Id,
      sortBy: options.shuffle ? ["Random"] : undefined,
    });
  }

  if (firstItem.Type === "MusicArtist") {
    return fetchSiblings(api, userId, {
      artistIds: firstItem.Id ? [firstItem.Id] : undefined,
      mediaTypes: ["Audio"],
      sortBy: options.shuffle
        ? ["Random"]
        : ["Album", "ParentIndexNumber", "IndexNumber", "SortName"],
    });
  }

  if (firstItem.MediaType === "Photo") {
    const siblings = await fetchSiblings(api, userId, {
      parentId: firstItem.ParentId,
      recursive: false,
      mediaTypes: ["Photo", "Video"],
      sortBy: [defaultSortBy],
    });
    // Re-anchor startIndex to the chosen photo, same as jellyfin-web.
    // SyncPlay doesn't currently consume startIndex from queryOptions,
    // but we keep parity for any future caller.
    if (siblings.length && options.queryOptions) {
      const idx = siblings.findIndex((i) => i.Id === firstItem.Id);
      if (idx >= 0) options.queryOptions.startIndex = idx;
    }
    return siblings;
  }

  if (firstItem.Type === "PhotoAlbum") {
    return fetchSiblings(api, userId, {
      parentId: firstItem.Id,
      recursive: false,
      mediaTypes: ["Photo", "Video"],
      sortBy: [defaultSortBy],
      limit: 1000,
    });
  }

  if (firstItem.Type === "MusicGenre") {
    return fetchSiblings(api, userId, {
      genreIds: firstItem.Id ? [firstItem.Id] : undefined,
      mediaTypes: ["Audio"],
      sortBy: [defaultSortBy],
    });
  }

  if (firstItem.IsFolder) {
    // Series, Season, BoxSet, MusicAlbum, etc. jellyfin-web only sets
    // SortBy for shuffle or BoxSet — everything else inherits server-side
    // sort order (typically index/premiere date).
    const sortBy = options.shuffle
      ? ["Random"]
      : firstItem.Type === "BoxSet"
        ? ["SortName"]
        : undefined;
    return fetchSiblings(api, userId, {
      parentId: firstItem.Id,
      mediaTypes: ["Audio", "Video"],
      sortBy,
    });
  }

  if (firstItem.Type === "Episode" && workingItems.length === 1) {
    // Single-episode auto-next: drop everything before this episode so
    // playback starts here and auto-advances through the rest of the
    // series. Gated on the user's `EnableNextEpisodeAutoPlay` like
    // jellyfin-web does.
    if (!user.Configuration?.EnableNextEpisodeAutoPlay || !firstItem.SeriesId) {
      return workingItems;
    }
    try {
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: firstItem.SeriesId,
        userId,
        isMissing: false,
        fields: PLAYBACK_FIELDS as unknown as never,
      });
      const all = res.data.Items ?? [];
      const foundIdx = Math.max(
        0,
        all.findIndex((e) => e.Id === firstItem.Id),
      );
      return all.slice(foundIdx);
    } catch (error) {
      // Don't block playback on a translation failure — fall back to the
      // single-item queue the caller already supplied.
      console.warn(
        "SyncPlay Helper: Episode translation failed, falling back to single item",
        error,
      );
      return workingItems;
    }
  }

  // Everything else (Movie, Audio, ...) plays as-is.
  return workingItems;
}
