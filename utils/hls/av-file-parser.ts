import * as FileSystem from "expo-file-system";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export interface StreamDefinition {
  id: string;
  networkURL: string;
  path: string;
  complete: boolean;
}

export interface StreamInfo {
  mediaPlaylistURL: string;
  localM3U8: string;
  segPaths: string[];
}

// Rewrites m3u8 files with local paths
export async function rewriteM3U8Files(path: string) {
  const streams = await getBootStreams(path);
  if (!streams) return;
  for (const stream of streams) {
    const streamDirectory = `${path}/${stream.id}`;
    processStream(streamDirectory);
  }
}

// Opens the boot.xml file and parses it to get the streams
const getBootStreams = async (path: string) => {
  const b = `${path}/boot.xml`;
  const fileInfo = await FileSystem.getInfoAsync(b);
  if (fileInfo.exists) {
    const boot = await FileSystem.readAsStringAsync(b, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return parseBootXML(boot);
  } else {
    console.log(`No boot.xml found in ${path}`);
  }
};

// Parse boot.xml to extract stream definitions.
export function parseBootXML(xml: string): StreamDefinition[] {
  const json = parser.parse(xml);
  const pkg = json.HLSMoviePackage;
  const streams = pkg.Streams.Stream;
  const streamArray: any[] = Array.isArray(streams) ? streams : [streams];
  return streamArray.map((s) => ({
    id: s["@_ID"],
    networkURL: s["@_NetworkURL"],
    path: s["@_Path"],
    complete: s.Complete.trim() === "YES",
  }));
}

// Parse StreamInfoBoot.xml to extract the local m3u8 path and segment paths.
export function parseStreamInfo(xml: string): StreamInfo {
  const json = parser.parse(xml);
  const streamInfo = json.StreamInfo;
  const mediaPlaylist = streamInfo.MediaPlaylist;
  const networkURL = mediaPlaylist.NetworkURL;
  const pathToLocalCopy = mediaPlaylist.PathToLocalCopy;
  let segs = mediaPlaylist?.MediaSegments?.SEG || [];
  if (!Array.isArray(segs)) segs = [segs];
  const segPaths = segs
    .map((seg: any) => seg["@_PATH"])
    .filter((p: string) => !!p);
  return {
    mediaPlaylistURL:
      (typeof networkURL === "string" ? networkURL : networkURL?.trim()) || "",
    localM3U8:
      (typeof pathToLocalCopy === "string"
        ? pathToLocalCopy
        : pathToLocalCopy?.trim()) || "",
    segPaths,
  };
}

// Update the m3u8 playlist content by replacing remote segment URLs with local paths.
export function updatePlaylistWithLocalSegments(
  playlistContent: string,
  segPaths: string[]
): string {
  const lines = playlistContent.split("\n");
  let segIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    // Replace non-comment lines (assumed to be segment URIs) with local paths.
    if (
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      segIndex < segPaths.length
    ) {
      lines[i] = segPaths[segIndex++];
    }
  }
  return lines.join("\n");
}

// Process a stream directory using Expo FileSystem.
export async function processStream(streamDir: string): Promise<void> {
  console.log(`Processing stream directory: ${streamDir}`);

  // Read StreamInfoBoot.xml from the stream directory.
  const streamInfoPath = `${streamDir}/StreamInfoBoot.xml`;
  console.log(`Reading StreamInfoBoot.xml from: ${streamInfoPath}`);
  try {
  const streamInfoXML = await FileSystem.readAsStringAsync(streamInfoPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
    console.log('Successfully read StreamInfoBoot.xml');
  const streamInfo = parseStreamInfo(streamInfoXML);
    console.log(`Parsed stream info: ${JSON.stringify(streamInfo, null, 2)}`);

  // Read the local m3u8 file.
  const playlistPath = `${streamDir}/${streamInfo.localM3U8}`;
    console.log(`Reading m3u8 playlist from: ${playlistPath}`);
  const playlistContent = await FileSystem.readAsStringAsync(playlistPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
    console.log('Successfully read m3u8 playlist');

  // Replace remote segment URIs with local segment paths.
    console.log('Updating playlist with local segment paths');
  const updatedPlaylist = updatePlaylistWithLocalSegments(
    playlistContent,
    streamInfo.segPaths
  );

  // Save the updated playlist back to disk.
    console.log(`Writing updated playlist back to: ${playlistPath}`);
  await FileSystem.writeAsStringAsync(playlistPath, updatedPlaylist, {
    encoding: FileSystem.EncodingType.UTF8,
  });
    console.log('Successfully wrote updated playlist');

  } catch (error) {
    console.error(`Error processing stream directory ${streamDir}:`, error);
    throw error;
}
}
