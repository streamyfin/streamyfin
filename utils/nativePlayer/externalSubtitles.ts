import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { Directory, File, Paths } from "expo-file-system";
import {
  SUBTITLE_PREFETCH_BUDGET_MS,
  SUBTITLE_PREFETCH_PER_SUBTITLE_MS,
} from "@/constants/Playback";
import {
  getJellyfinHeadersForUrl,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import { getExternalSubtitleUrl } from "@/utils/jellyfin/subtitleUtils";

// Sidecar subtitles are fetched onto disk before the stream is handed to the
// player: a subtitle the engine itself must fetch over the network wedges the
// whole pipeline when the path is slow — SingleSampleMediaPeriod holds the
// period and pins its buffered position to 0 until the file lands, and its
// retry loop can end playback (ExoPlayer #8566; observed as a minutes-long
// next-episode stall behind a reverse proxy). Hard budget for the whole
// prefetch, plus a per-subtitle cap so one dead sidecar cannot starve every
// subtitle after it; a subtitle that misses is undelivered for this session —
// playback without a subtitle beats a stalled stream.

const CACHE_SUBDIR = "subtitles";

// A budget timeout rejects the caller but does not cancel the native
// download: sweep the staging file again after the abandoned transfer has
// had time to settle.
const LATE_STAGING_SWEEP_MS = 60_000;

// Attempt-unique suffix for staging names: an abandoned transfer keeps
// writing its `.part` after the timeout, so a later attempt must not reuse —
// or be swept by — the same path.
let stagingAttempt = 0;

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

export const localSubtitleFileName = (
  item: BaseItemDto,
  mediaSourceId: string | null | undefined,
  sub: MediaStream,
  url: string,
): string =>
  // The media source is part of the name: two versions of one item can share
  // a subtitle index and extension, and the second version must not reuse the
  // first one's file.
  `${item.Id ?? "item"}-${mediaSourceId ?? "source"}-${sub.Index}.${extensionFromUrl(url, sub.Codec)}`;

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
 * Download every external subtitle of `mediaSource` into the cache directory
 * and point its `DeliveryUrl` at the local file — the same DeliveryUrl
 * rewrite the offline flow (`downloadSubtitles`) makes, so the engine's
 * side-loaded track and the identity matcher (`getExpectedExternalUrl` on the
 * same object) stay in agreement without extra plumbing.
 *
 * Whatever cannot be fetched within the budget — or at all — is left with its
 * remote URL stripped by the sweep below, so neither the engine nor the
 * matcher treats it as available this session.
 *
 * Sequential on purpose: concurrent subtitle requests make Jellyfin's
 * first-time extraction race with itself and serve corrupted files (same as
 * the offline downloadSubtitles flow).
 */
export const prefetchExternalSubtitles = async (params: {
  mediaSource: MediaSourceInfo;
  item: BaseItemDto;
  api: Api;
  budgetMs?: number;
  perSubtitleMs?: number;
}): Promise<void> => {
  const externals =
    params.mediaSource.MediaStreams?.filter(
      (s) => s.Type === "Subtitle" && s.DeliveryMethod === "External",
    ) ?? [];
  if (externals.length === 0) return;

  let cacheDir: Directory | null = null;
  try {
    cacheDir = new Directory(Paths.cache, CACHE_SUBDIR);
    if (!cacheDir.exists) cacheDir.create();
  } catch {
    // Nowhere to cache means no downloads; the sweep below still undelivers
    // every remote sub, which is the safe outcome.
    cacheDir = null;
  }

  const deadline =
    Date.now() + (params.budgetMs ?? SUBTITLE_PREFETCH_BUDGET_MS);
  const perSubtitleMs =
    params.perSubtitleMs ?? SUBTITLE_PREFETCH_PER_SUBTITLE_MS;
  const mediaSourceId = params.mediaSource.Id;

  for (const sub of externals) {
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
    );
    const destination = new File(cacheDir, fileName);
    const key = destination.uri;

    // The warm and the swap both land here for the same file; wait for the
    // other caller's download instead of starting a second one.
    const running = inFlight.get(key);
    if (running) {
      try {
        await withTimeout(running, deadline - Date.now());
      } catch {
        // Failed or out of budget either way; fall through to the checks.
      }
    }
    // Cached already — by an earlier pass or by the warm that just finished.
    if (destination.exists) {
      sub.DeliveryUrl = destination.uri;
      continue;
    }

    const pending = new File(cacheDir, `${fileName}.${++stagingAttempt}.part`);
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
    // completion: a budget timeout cannot cancel the native download, and a
    // later completion would otherwise leave a partial file under the final
    // name for a future session to serve.
    const task: Promise<void> = (async () => {
      await withTimeout(
        File.downloadFileAsync(
          url,
          pending,
          optionsWithOptionalHeaders({}, headers),
        ),
        Math.min(deadline - Date.now(), perSubtitleMs),
      );
      // The move must be awaited: the URL below may only be exposed once the
      // final file exists at that path.
      await pending.move(destination);
    })();
    inFlight.set(key, task);
    void task
      .finally(() => inFlight.delete(key))
      .catch(() => {
        // Handled by the await below.
      });
    try {
      await withTimeout(task, deadline - Date.now());
      sub.DeliveryUrl = destination.uri;
    } catch {
      // A timeout before the transfer opened its output leaves nothing to
      // delete; the sweep below removes whatever the abandoned download
      // writes after this point.
      removeStaging(pending);
      setTimeout(() => removeStaging(pending), LATE_STAGING_SWEEP_MS);
    }
  }

  // A remote DeliveryUrl left standing here would send the ENGINE after the
  // subtitle over the network — the exact pipeline-wedging fetch this
  // prefetch exists to avoid. Undeliver it for this session instead.
  for (const sub of externals) {
    if (sub.DeliveryUrl && !sub.DeliveryUrl.startsWith("file://")) {
      sub.DeliveryUrl = undefined;
    }
  }
};
