type EmbeddedSubtitle = {
  name: string;
  index: number;
  isExternal: boolean;
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
  IsTextSubtitleStream: boolean;
}

export { EmbeddedSubtitle, ExternalSubtitle, TranscodedSubtitle };