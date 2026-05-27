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

export type { EmbeddedSubtitle, ExternalSubtitle, TranscodedSubtitle, Track };
