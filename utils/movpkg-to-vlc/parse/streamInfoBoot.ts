import { XMLParser } from "fast-xml-parser";

export interface StreamInfo {
  Version: string;
  Complete: string;
  PeakBandwidth: number;
  Compressable: string;
  MediaPlaylist: MediaPlaylist;
  Type: string;
  MediaSegments: {
    SEG: SEG[];
  };
  EvictionPolicy: string;
  MediaBytesStored: number;
}

export interface MediaPlaylist {
  NetworkURL: string;
  PathToLocalCopy: string;
}

export interface SEG {
  Dur: number;
  Len: number;
  Off: number;
  PATH: string;
  SeqNum: number;
  Tim: number;
  URL: string;
}

export async function parseStreamInfoXml(xml: string): Promise<StreamInfo> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
    isArray: (tagName, jPath) => {
      // Force SEG elements to always be an array
      if (jPath === "StreamInfo.MediaSegments.SEG") return true;
      return false;
    },
  });
  const jsonObj = parser.parse(xml);
  return jsonObj.StreamInfo as StreamInfo;
}
