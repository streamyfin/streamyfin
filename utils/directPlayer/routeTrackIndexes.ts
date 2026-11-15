import {
  type DownloadedTrackIndexes,
  recordedTracks,
} from "@/utils/downloads/recordedTracks";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";

// Route params are strings; a missing or blank one parses to NaN, which must
// not be read as a real selection.
const asIndex = (raw: string | undefined): number | undefined => {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

interface RouteTracks {
  audioIndex: string | undefined;
  subtitleIndex: string | undefined;
  offline: boolean;
  downloaded?: DownloadedTrackIndexes | null;
}

/**
 * The tracks the route, then offline the download record, names. Nothing
 * named stays undefined: the next episode then has no selection to carry over.
 */
export const routeTrackSelection = ({
  audioIndex,
  subtitleIndex,
  offline,
  downloaded,
}: RouteTracks): { audioIndex?: number; subtitleIndex?: number } => {
  const record = offline ? recordedTracks(downloaded) : undefined;
  return {
    audioIndex: asIndex(audioIndex) ?? record?.audioStreamIndex,
    subtitleIndex: asIndex(subtitleIndex) ?? record?.subtitleStreamIndex,
  };
};

/**
 * The tracks a direct player route is on. A downloaded item opens with neither
 * index in the route, so offline the download record fills the gap; the player
 * and its menus must all read this, or they disagree on what is selected.
 */
export const resolveRouteTrackIndexes = (
  route: RouteTracks,
): { audioIndex: number | undefined; subtitleIndex: number } => {
  const { audioIndex, subtitleIndex } = routeTrackSelection(route);
  return { audioIndex, subtitleIndex: subtitleIndex ?? SUBTITLES_OFF };
};
