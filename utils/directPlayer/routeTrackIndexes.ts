import type { DownloadedTrackIndexes } from "@/utils/nativePlayer/resolveTrackIndexes";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";

// Route params are strings; a missing or blank one parses to NaN, which must
// not be read as a real selection.
const asIndex = (raw: string | undefined): number | undefined => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The tracks a direct player route is on. A downloaded item opens with neither
 * index in the route, so offline the download record fills the gap; the player
 * and its menus must all read this, or they disagree on what is selected.
 */
export const resolveRouteTrackIndexes = ({
  audioIndex,
  subtitleIndex,
  offline,
  downloaded,
}: {
  audioIndex: string | undefined;
  subtitleIndex: string | undefined;
  offline: boolean;
  downloaded?: DownloadedTrackIndexes | null;
}): { audioIndex: number | undefined; subtitleIndex: number } => ({
  audioIndex:
    asIndex(audioIndex) ?? (offline ? downloaded?.audioStreamIndex : undefined),
  subtitleIndex:
    asIndex(subtitleIndex) ??
    (offline ? downloaded?.subtitleStreamIndex : undefined) ??
    SUBTITLES_OFF,
});
