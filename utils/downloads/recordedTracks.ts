/** The track indexes a download record pinned when the file was pulled down. */
export interface DownloadedTrackIndexes {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  isTranscoded?: boolean;
}

/**
 * The tracks a download record names. Records written by 0.51 and older hold
 * 0 for both as a placeholder, not a pick, and no isTranscoded, which every
 * writer since sets: those name none.
 */
export const recordedTracks = (
  downloaded: DownloadedTrackIndexes | null | undefined,
): DownloadedTrackIndexes | undefined =>
  downloaded?.isTranscoded === undefined ? undefined : downloaded;
