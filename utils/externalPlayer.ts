import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { File } from "expo-file-system";
import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { filePathToUri } from "@/providers/Downloads/utils";
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
