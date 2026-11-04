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
  sub: MediaStream,
  url: string,
): string =>
  `${item.Id ?? "item"}-${sub.Index}.${extensionFromUrl(url, sub.Codec)}`;

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

  const cacheDir = new Directory(Paths.cache, CACHE_SUBDIR);
  try {
    if (!cacheDir.exists) cacheDir.create();
  } catch {
    // Nowhere to cache means no prefetch; the sweep below then undelivers
    // every remote sub, which is the safe outcome.
    return;
  }

  const deadline =
    Date.now() + (params.budgetMs ?? SUBTITLE_PREFETCH_BUDGET_MS);
  const perSubtitleMs =
    params.perSubtitleMs ?? SUBTITLE_PREFETCH_PER_SUBTITLE_MS;

  for (const sub of externals) {
    const url = getExternalSubtitleUrl(sub, {
      offline: false,
      basePath: params.api.basePath,
    });
    // Already local (a third-party path or a previous pass): keep as is.
    if (!url || url.startsWith("file://")) continue;
    if (Date.now() >= deadline) break;

    const destination = new File(
      cacheDir,
      localSubtitleFileName(params.item, sub, url),
    );
    // Downloads land on a throwaway .part name and are moved into place on
    // completion: a budget timeout cannot cancel the native download, and a
    // later completion would otherwise leave a partial file under the final
    // name for a future session to serve.
    let pending: File | undefined;
    try {
      if (!destination.exists) {
        pending = new File(
          cacheDir,
          `${localSubtitleFileName(params.item, sub, url)}.part`,
        );
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
        await withTimeout(
          File.downloadFileAsync(
            url,
            pending,
            optionsWithOptionalHeaders({}, headers),
          ),
          Math.min(deadline - Date.now(), perSubtitleMs),
        );
        pending.move(destination);
      }
      sub.DeliveryUrl = destination.uri;
    } catch {
      try {
        pending?.delete();
      } catch {
        // The part file lives in the OS cache; losing its cleanup is fine.
      }
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
