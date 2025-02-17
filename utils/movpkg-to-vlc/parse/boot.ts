import { XMLParser } from "fast-xml-parser";

export interface Boot {
  Version: string;
  HLSMoviePackageType: string;
  Streams: {
    Stream: Stream[];
  };
  MasterPlaylist: {
    NetworkURL: string;
  };
  DataItems: {
    Directory: string;
    DataItem: DataItem;
  };
}

export interface Stream {
  ID: string;
  NetworkURL: string;
  Path: string;
  Complete: string; // "YES" or "NO"
}

export interface DataItem {
  ID: string;
  Category: string;
  Name: string;
  DescriptorPath: string;
  DataPath: string;
  Role: string;
}

export async function parseBootXML(xml: string): Promise<Boot> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: true,
  });
  const jsonObj = parser.parse(xml);
  return jsonObj.HLSMoviePackage as Boot;
}
