import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { File } from "expo-file-system";
import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { filePathToUri } from "@/providers/Downloads/utils";
import { isImageBasedSubtitle } from "@/utils/jellyfin/subtitleUtils";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { msToTicks, ticksToMs } from "@/utils/time";

/**
 * Whether video can go to another app at all. A mode this build does not know
 * (the plugin can push one) plays as off.
 */
export const isExternalPlayerEnabled = (
  mode: ExternalPlayerMode | undefined,
): boolean =>
  mode === "askOnLongPress" || mode === "ask" || mode === "external";

/**
 * Whether this play goes to another app: where the user picked when asked,
 * otherwise where a tap goes (asking is the play button's sheet, so without a
 * pick both asking modes play in Streamyfin). Live TV never does: the in-app
 * route opens the server's live stream and has to close it again.
 */
export const shouldUseExternalPlayer = (
  mode: ExternalPlayerMode | undefined,
  item?: BaseItemDto | null,
  picked?: boolean,
): boolean => {
  if (!isExternalPlayerEnabled(mode)) return false;
  if (item?.Type === "Program" || item?.Type === "TvChannel") return false;
  return picked ?? mode === "external";
};

/**
 * What the other app is handed: the downloaded file, as a URI that app is
 * allowed to read (on Android a content:// one, file:// is refused), or a
 * direct stream of the original file, so the server starts no transcode that
 * nothing would stop. Null when there is nothing to hand over.
 */
export const getExternalPlayerUri = (
  api: Api | null | undefined,
  req: PlayRequest,
): string | null => {
  if (req.offline) {
    const path = getDownloadedItemById(req.itemId)?.videoFilePath;
    if (!path) return null;
    const file = new File(filePathToUri(path));
    return file.exists ? file.contentUri : null;
  }
  if (!api?.accessToken) return null;
  const params = new URLSearchParams({
    static: "true",
    ApiKey: api.accessToken,
  });
  if (req.mediaSourceId) params.set("mediaSourceId", req.mediaSourceId);
  return `${api.basePath}/Videos/${req.itemId}/stream?${params.toString()}`;
};

export interface ExternalPlayerSubtitles {
  /** Every subtitle handed over, `selected` first. */
  uris: string[];
  /** The one Streamyfin would show; none when the user turned subtitles off. */
  selected?: string;
}

interface SubtitleFile {
  index: number;
  uri: string;
}

/**
 * Every text subtitle of the media source, as SRT the server converts it to,
 * the ones inside the file included: a Chromecast shows none from inside the
 * file, so BubbleUPnP casting it needs them as files. Image subtitles cannot
 * become text and stay out.
 */
const streamedSubtitles = (
  api: Api | null | undefined,
  req: PlayRequest,
  item?: BaseItemDto | null,
  mediaSource?: MediaSourceInfo | null,
): { files: SubtitleFile[]; defaultIndex?: number | null } => {
  const source =
    mediaSource ??
    item?.MediaSources?.find((s) => s.Id === req.mediaSourceId) ??
    item?.MediaSources?.[0];
  if (!api?.accessToken || !source?.Id) return { files: [] };
  const query = new URLSearchParams({ ApiKey: api.accessToken }).toString();
  const files = (source.MediaStreams ?? []).flatMap((s) =>
    s.Type === "Subtitle" && !isImageBasedSubtitle(s) && s.Index != null
      ? [
          {
            index: s.Index,
            uri: `${api.basePath}/Videos/${req.itemId}/${source.Id}/Subtitles/${s.Index}/Stream.srt?${query}`,
          },
        ]
      : [],
  );
  return { files, defaultIndex: source.DefaultSubtitleStreamIndex };
};

/**
 * The subtitle files saved with the download, readable by the other app. A
 * subtitle inside the downloaded video only reaches a player that reads the
 * file itself.
 */
const downloadedSubtitles = (
  req: PlayRequest,
): { files: SubtitleFile[]; defaultIndex?: number | null } => {
  const downloaded = getDownloadedItemById(req.itemId);
  const files = (downloaded?.mediaSource.MediaStreams ?? []).flatMap((s) => {
    // A download points DeliveryUrl at the file it saved; an unsaved one keeps
    // the server's.
    if (s.Type !== "Subtitle" || !s.DeliveryUrl?.startsWith("file://")) {
      return [];
    }
    const file = new File(s.DeliveryUrl);
    return file.exists ? [{ index: s.Index ?? -1, uri: file.contentUri }] : [];
  });
  return { files, defaultIndex: downloaded?.userData?.subtitleStreamIndex };
};

/**
 * The subtitles the other app is handed, the one picked in Streamyfin first
 * (the source's default when nothing was picked, none for -1, off). A stream's
 * come from `mediaSource`, the version being played, or else the item's own.
 */
export const getExternalPlayerSubtitles = (
  api: Api | null | undefined,
  req: PlayRequest,
  item?: BaseItemDto | null,
  mediaSource?: MediaSourceInfo | null,
): ExternalPlayerSubtitles => {
  const { files, defaultIndex } = req.offline
    ? downloadedSubtitles(req)
    : streamedSubtitles(api, req, item, mediaSource);
  const selectedIndex = req.subtitleIndex ?? defaultIndex;
  const selected = files.find((f) => f.index === selectedIndex)?.uri;
  return {
    uris: [
      ...(selected ? [selected] : []),
      ...files.map((f) => f.uri).filter((uri) => uri !== selected),
    ],
    selected,
  };
};

/**
 * What the other app is told at launch: where to start, the title, and to
 * report back where it stopped. A request without a position resumes at the
 * stored one, as the in-app players do. The names follow the MX Player API,
 * which VLC, mpv and Just Player read too; on Android they travel as intent
 * extras.
 */
export const buildExternalPlayerLaunchParams = (
  req: PlayRequest,
  item?: BaseItemDto | null,
): Record<string, unknown> => {
  const params: Record<string, unknown> = { return_result: true };
  const positionMs = ticksToMs(
    req.playbackPositionTicks ?? item?.UserData?.PlaybackPositionTicks ?? 0,
  );
  if (positionMs > 0) params.position = positionMs;
  if (item?.Name) params.title = item.Name;
  return params;
};

/**
 * The subtitle list, as the URI arrays of the MX Player API: `subs` is every
 * subtitle and `subs.enable` the one to show. MX Player, mpv, Just Player and
 * BubbleUPnP read `subs`.
 */
export const buildExternalPlayerSubtitleExtras = (
  subtitles: ExternalPlayerSubtitles,
): Record<string, string[]> | undefined => {
  if (subtitles.uris.length === 0) return undefined;
  return {
    subs: subtitles.uris,
    ...(subtitles.selected && { "subs.enable": [subtitles.selected] }),
  };
};

export type ExternalPlayerResult =
  | { completed: true }
  | { completed: false; positionTicks: number };

/**
 * Reads how far the other app got from what it returned. VLC sends
 * `extra_position`; players on the MX Player API send `position`, and
 * `end_by: "playback_completion"` once the video ran to its end. Anything
 * else, a 0 included, is no answer: reporting it would wipe the resume point.
 */
export const readExternalPlayerResult = (
  returned: object | undefined,
): ExternalPlayerResult | null => {
  if (!returned) return null;
  const values = returned as Record<string, unknown>;
  if (values.end_by === "playback_completion") return { completed: true };
  const positionMs = values.extra_position ?? values.position;
  if (
    typeof positionMs !== "number" ||
    !Number.isFinite(positionMs) ||
    positionMs <= 0
  ) {
    return null;
  }
  return { completed: false, positionTicks: msToTicks(positionMs) };
};
