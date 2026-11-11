import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { Directory, File, Paths } from "expo-file-system";
import {
  SUBTITLE_PREFETCH_BUDGET_MS,
  SUBTITLE_PREFETCH_CACHE_DIR,
  SUBTITLE_PREFETCH_LATE_SWEEP_MS,
  SUBTITLE_PREFETCH_PER_SUBTITLE_MS,
} from "@/constants/Playback";
import {
  getJellyfinHeadersForUrl,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import { getExternalSubtitleUrl } from "@/utils/jellyfin/subtitleUtils";
import { writeInfoLog } from "@/utils/log";

// Sidecar subtitles are fetched onto disk before the stream is handed to the
// ExoPlayer engine: a sidecar it must fetch itself over a slow path wedges the
// whole pipeline (observed as a minutes-long next-episode stall behind a
// reverse proxy). Hard budget for the whole prefetch, plus a per-subtitle cap
// so one dead sidecar cannot starve the rest. The subtitle the session shows
// goes first and is never dropped: one the budget misses keeps its remote URL
// and the engine fetches it, as before this prefetch existed. Any other one it
// misses is left out for the session; picking it renegotiates the stream,
// which prefetches it again with a fresh budget.

// Attempt-unique staging name: an abandoned transfer keeps writing its
// `.part` after the timeout, so a later attempt must not reuse — or be swept
// by — the same path. Timestamp + random: unique across attempts AND across
// app restarts, so a leftover file from a crashed run is never adopted.
export const stagingName = (fileName: string): string =>
  `${fileName}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.part`;

/** The engines sniff the MIME from the extension; keep the served one. */
const extensionFromUrl = (url: string, codec?: string | null): string => {
  const path = url.split("?")[0] ?? "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  // An extensionless URL (some third-party providers): the stream's codec
  // names the container better than a blind "srt" would. "subrip" is the
  // codec spelling of srt.
  const fromCodec = codec === "subrip" ? "srt" : (codec ?? "").toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(fromCodec) ? fromCodec : "srt";
};

/** FNV-1a, 32 bits, as hex: a short, stable tag for a cache file name. */
const shortHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export const localSubtitleFileName = (
  item: BaseItemDto,
  mediaSourceId: string | null | undefined,
  sub: MediaStream,
  url: string,
  basePath?: string | null,
): string => {
  // The media source is part of the name: two versions of one item can share
  // a subtitle index. So is the server (two servers can hold the same item
  // id) and what the stream is: Jellyfin numbers sidecars first, so adding
  // one shifts every index, and the French row must not get the German file
  // cached under its old index.
  const identity = shortHash(
    [
      basePath ?? "",
      sub.Language ?? "",
      sub.Codec ?? "",
      sub.DisplayTitle ?? sub.Title ?? "",
      sub.IsExternal ? "external" : "embedded",
    ].join("|"),
  );
  return `${item.Id ?? "item"}-${mediaSourceId ?? "source"}-${sub.Index}-${identity}.${extensionFromUrl(url, sub.Codec)}`;
};

/**
 * Empties the prefetch cache, for a new player. A sidecar re-synced on the
 * server in place keeps its cache name, so a file kept from an earlier player
 * could serve the old cues; the cache only has to carry a file from the
 * next-episode warm to its swap, both inside one player.
 */
export const clearSubtitlePrefetchCache = (): void => {
  try {
    const dir = new Directory(Paths.cache, SUBTITLE_PREFETCH_CACHE_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // Best effort: the next new player tries again.
  }
};

/** Which sidecars a prefetch left where, by stream index. */
export type SubtitlePrefetchOutcome = {
  /** Read from disk by the engine. */
  onDisk: number[];
  /** Fetched by the engine itself: the session's subtitle the budget missed. */
  keptRemote: number[];
  /** Without a URL for the session: picking one renegotiates the stream. */
  leftOut: number[];
};

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("subtitle prefetch budget exhausted")),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

/**
 * One in-flight download per destination: the next-episode warm and the swap
 * prefetch run this function concurrently for the same file. Without this,
 * both write the same `.part` staging name — the second native download
 * rejects, its catch deletes the staging file the first one is still moving,
 * and the subtitle is lost for the session.
 */
const inFlight = new Map<string, Promise<void>>();

const removeStaging = (file: File) => {
  try {
    file.delete();
  } catch {
    // The staging file lives in the OS cache; losing its cleanup is fine.
  }
};

/**
 * Download the external subtitles of `mediaSource` into the cache directory,
 * the preferred one first, and point each `DeliveryUrl` at its local file.
 * The offline flow (`downloadSubtitles`) makes the same rewrite, so the
 * engine's side-loaded track and the identity matcher (`getExpectedExternalUrl`
 * on the same object) stay in agreement without extra plumbing.
 *
 * Whatever cannot be fetched within the budget, or at all, has its remote URL
 * stripped by the sweep below, so neither the engine nor the matcher treats it
 * as available this session; the preferred subtitle keeps its remote URL.
 *
 * Sequential on purpose: concurrent subtitle requests make Jellyfin's
 * first-time extraction race with itself and serve corrupted files (same as
 * the offline downloadSubtitles flow).
 */
export const prefetchExternalSubtitles = async (params: {
  mediaSource: MediaSourceInfo;
  item: BaseItemDto;
  api: Api;
  /** The subtitle the session will show: fetched first, never left out. */
  preferredIndex?: number | null;
  budgetMs?: number;
  perSubtitleMs?: number;
}): Promise<SubtitlePrefetchOutcome> => {
  const externals =
    params.mediaSource.MediaStreams?.filter(
      (s) => s.Type === "Subtitle" && s.DeliveryMethod === "External",
    ) ?? [];
  if (externals.length === 0)
    return { onDisk: [], keptRemote: [], leftOut: [] };
  const startedAt = Date.now();
  const isPreferred = (sub: MediaStream) =>
    params.preferredIndex != null && sub.Index === params.preferredIndex;
  // The budget may not reach every sidecar: the one on screen goes first.
  const ordered = [
    ...externals.filter(isPreferred),
    ...externals.filter((sub) => !isPreferred(sub)),
  ];

  let cacheDir: Directory | null = null;
  try {
    cacheDir = new Directory(Paths.cache, SUBTITLE_PREFETCH_CACHE_DIR);
    if (!cacheDir.exists) cacheDir.create();
  } catch {
    // Nowhere to cache means no downloads; the sweep below leaves the
    // preferred subtitle remote and every other one out.
    cacheDir = null;
  }

  const deadline =
    Date.now() + (params.budgetMs ?? SUBTITLE_PREFETCH_BUDGET_MS);
  const perSubtitleMs =
    params.perSubtitleMs ?? SUBTITLE_PREFETCH_PER_SUBTITLE_MS;
  const mediaSourceId = params.mediaSource.Id;

  for (const sub of ordered) {
    const url = getExternalSubtitleUrl(sub, {
      offline: false,
      basePath: params.api.basePath,
    });
    // Already local (a third-party path or a previous pass): keep as is.
    if (!url || url.startsWith("file://")) continue;
    if (Date.now() >= deadline) break;
    if (!cacheDir) continue;

    const fileName = localSubtitleFileName(
      params.item,
      mediaSourceId,
      sub,
      url,
      params.api.basePath,
    );
    const destination = new File(cacheDir, fileName);
    const key = destination.uri;

    // The warm and the swap both land here for the same file; wait for the
    // other caller's download instead of starting a second one.
    // Read the entry again after each wait: when the download it waited on
    // fails, another waiter may already have started the next one.
    let running = inFlight.get(key);
    while (running && Date.now() < deadline) {
      try {
        await withTimeout(running, deadline - Date.now());
      } catch {
        // Failed or out of budget either way; the checks below decide.
      }
      running = inFlight.get(key);
    }
    // Cached already — by an earlier pass or by the warm that just finished.
    if (destination.exists) {
      sub.DeliveryUrl = destination.uri;
      continue;
    }
    // The wait above can spend the rest of the budget; a download started
    // now would be dispatched before its zero timeout aborts it, a second
    // request beside the one still running.
    if (Date.now() >= deadline) break;

    const pending = new File(cacheDir, stagingName(fileName));
    // The path, not the object: a File repoints at its destination once its
    // move succeeds, and a cleanup through it would delete the final file.
    const stagingUri = pending.uri;
    // No Jellyfin credentials on a URL the server does not host.
    const proxyHeaders = getJellyfinHeadersForUrl(url, params.api.basePath);
    const headers = sub.IsExternalUrl
      ? proxyHeaders
      : {
          ...proxyHeaders,
          ...(params.api.accessToken
            ? {
                Authorization: `MediaBrowser Token="${params.api.accessToken}"`,
              }
            : {}),
        };
    // Downloads land on a throwaway .part name and are moved into place on
    // completion, so a transfer cut short never leaves a partial file under
    // the final name for a future session to serve. Its time up, the native
    // transfer is cancelled, not abandoned: left running, it would compete
    // with the next subtitle's request (concurrent requests corrupt
    // Jellyfin's first extraction) and with the video's first buffer.
    const transfer = new AbortController();
    const task: Promise<void> = (async () => {
      try {
        await withTimeout(
          File.downloadFileAsync(
            url,
            pending,
            optionsWithOptionalHeaders({ signal: transfer.signal }, headers),
          ),
          Math.min(deadline - Date.now(), perSubtitleMs),
        );
      } catch (error) {
        transfer.abort();
        throw error;
      }
      // The move must be awaited: the URL below may only be exposed once the
      // final file exists at that path.
      await pending.move(destination);
    })();
    inFlight.set(key, task);
    void task
      .finally(() => {
        // Only this task's own entry: a later caller may have taken the key.
        if (inFlight.get(key) === task) inFlight.delete(key);
      })
      .catch(() => {
        // Handled by the await below.
      });
    try {
      await withTimeout(task, deadline - Date.now());
      sub.DeliveryUrl = destination.uri;
    } catch {
      transfer.abort();
      // A timeout before the transfer opened its output leaves nothing to
      // delete; the late sweep removes whatever the cancelled transfer still
      // wrote before its cancel landed.
      removeStaging(new File(stagingUri));
      const sweep = setTimeout(
        () => removeStaging(new File(stagingUri)),
        SUBTITLE_PREFETCH_LATE_SWEEP_MS,
      );
      // A Node timer (Jest) keeps the process alive for the whole minute;
      // React Native's has no unref and needs none.
      (sweep as { unref?: () => void }).unref?.();
    }
  }

  // A remote sidecar left standing would send the engine after it over the
  // network, which wedges the pipeline on a slow path, so the misses are left
  // out for the session: all but the one the session shows, which keeps its
  // remote URL rather than going missing.
  for (const sub of externals) {
    if (
      !isPreferred(sub) &&
      sub.DeliveryUrl &&
      !sub.DeliveryUrl.startsWith("file://")
    ) {
      sub.DeliveryUrl = undefined;
    }
  }

  // One line per load, for a "subtitles missing" report: what the engine
  // reads from disk, what it fetches itself, and what this session leaves out.
  const onDisk: number[] = [];
  const keptRemote: number[] = [];
  const leftOut: number[] = [];
  for (const sub of externals) {
    const index = sub.Index ?? -1;
    if (sub.DeliveryUrl?.startsWith("file://")) onDisk.push(index);
    else if (sub.DeliveryUrl) keptRemote.push(index);
    else leftOut.push(index);
  }
  writeInfoLog(
    `Subtitle prefetch: ${onDisk.length} of ${externals.length} on disk in ${Date.now() - startedAt} ms`,
    { itemId: params.item.Id, onDisk, keptRemote, leftOut },
  );
  return { onDisk, keptRemote, leftOut };
};
