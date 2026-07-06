type EmbeddedSubtitle = {
  name: string;
  index: number;
};

type ExternalSubtitle = {
  name: string;
  index: number;
  isExternal: boolean;
  deliveryUrl: string;
};

type TranscodedSubtitle = {
  name: string;
  index: number;
  deliveryUrl: string;
  IsTextSubtitleStream: boolean;
};

type Track = {
  name: string;
  index: number;
  mpvIndex?: number;
  setTrack: () => void;
  /** True for client-side downloaded subtitles (e.g., from OpenSubtitles) */
  isLocal?: boolean;
  /** File path for local subtitles */
  localPath?: string;
};

/**
 * Synthetic `Track.index` base for client-side downloaded subtitles (loaded via
 * `addSubtitleFile`, no matching Jellyfin MediaStream). Local sub k gets
 * `LOCAL_SUBTITLE_INDEX_START - k`, so `index <= LOCAL_SUBTITLE_INDEX_START`
 * identifies a local track.
 */
export const LOCAL_SUBTITLE_INDEX_START = -100;

export type { EmbeddedSubtitle, ExternalSubtitle, Track, TranscodedSubtitle };
