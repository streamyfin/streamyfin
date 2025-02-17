import * as FileSystem from "expo-file-system";
import { parseBootXML } from "./parse/boot";
import { parseStreamInfoXml, StreamInfo } from "./parse/streamInfoBoot";

export async function rewriteM3U8Files(baseDir: string): Promise<void> {
  console.log(`[1] Rewriting M3U8 files in ${baseDir}`);
  const bootData = await loadBootData(baseDir);
  if (!bootData) return;

  const localPlaylistPaths = await processAllStreams(baseDir, bootData);
  await updateMasterPlaylist(
    `${baseDir}/Data/${bootData.DataItems.DataItem.DataPath}`,
    localPlaylistPaths
  );
}

async function loadBootData(baseDir: string): Promise<any | null> {
  console.log(`[2] Loading boot.xml from ${baseDir}`);
  const bootPath = `${baseDir}/boot.xml`;
  try {
    const bootInfo = await FileSystem.getInfoAsync(bootPath);
    if (!bootInfo.exists) throw new Error("boot.xml not found");

    const bootXML = await FileSystem.readAsStringAsync(bootPath);
    return parseBootXML(bootXML);
  } catch (error) {
    console.error(`Failed to load boot.xml from ${baseDir}:`, error);
    return null;
  }
}

async function processAllStreams(
  baseDir: string,
  bootData: any
): Promise<string[]> {
  console.log(`[3] Processing all streams in ${baseDir}`);
  const localPaths: string[] = [];
  const streams = Array.isArray(bootData.Streams.Stream)
    ? bootData.Streams.Stream
    : [bootData.Streams.Stream];

  for (const stream of streams) {
    const streamDir = `${baseDir}/${stream.ID}`;
    try {
      const streamInfo = await processStream(streamDir);
      if (streamInfo && streamInfo.MediaPlaylist.PathToLocalCopy) {
        localPaths.push(
          `${streamDir}/${streamInfo.MediaPlaylist.PathToLocalCopy}`
        );
      }
    } catch (error) {
      console.error(`Skipping stream ${stream.ID} due to error:`, error);
    }
  }
  return localPaths;
}

async function updateMasterPlaylist(
  masterPath: string,
  localPlaylistPaths: string[]
): Promise<void> {
  try {
    const masterContent = await FileSystem.readAsStringAsync(masterPath);
    const updatedContent = updatePlaylistWithLocalSegments(
      masterContent,
      localPlaylistPaths
    );
    await FileSystem.writeAsStringAsync(masterPath, updatedContent);
  } catch (error) {
    console.error(`Error updating master playlist at ${masterPath}:`, error);
    throw error;
  }
}

export function updatePlaylistWithLocalSegments(
  content: string,
  localPaths: string[]
): string {
  const lines = content.split("\n");
  let index = 0;

  for (let i = 0; i < lines.length && index < localPaths.length; i++) {
    if (lines[i].trim() && !lines[i].startsWith("#")) {
      lines[i] = localPaths[index++];
    }
  }
  return lines.join("\n");
}

export async function processStream(
  streamDir: string
): Promise<StreamInfo | null> {
  console.log(`[4] Processing stream at ${streamDir}`);
  const streamInfoPath = `${streamDir}/StreamInfoBoot.xml`;
  console.log(`Processing stream at ${streamDir}...`);

  try {
    const streamXML = await FileSystem.readAsStringAsync(streamInfoPath);
    const streamInfo = await parseStreamInfoXml(streamXML);

    const localM3u8RelPath = streamInfo.MediaPlaylist?.PathToLocalCopy;
    if (!localM3u8RelPath) {
      console.warn(`No local m3u8 specified in ${streamDir}; skipping.`);
      return null;
    }

    const m3u8Path = `${streamDir}/${localM3u8RelPath}`;
    const m3u8Content = await FileSystem.readAsStringAsync(m3u8Path);

    const localSegmentPaths = streamInfo.MediaSegments.SEG.map(
      (seg) => `${streamDir}/${seg.PATH}`
    );
    const updatedContent = updatePlaylistWithLocalSegments(
      m3u8Content,
      localSegmentPaths
    );
    await FileSystem.writeAsStringAsync(m3u8Path, updatedContent);

    return streamInfo;
  } catch (error) {
    console.error(`Error processing stream at ${streamDir}:`, error);
    throw error;
  }
}
