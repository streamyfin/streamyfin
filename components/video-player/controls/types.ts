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
  setTrack: () => void;
};

export { EmbeddedSubtitle, ExternalSubtitle, TranscodedSubtitle, Track };
