import * as FileSystem from "expo-file-system";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dimensions, StyleSheet, Text, View } from "react-native";

import {
  PipStartedPayload,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "../../vlc-player/src/VlcPlayer.types";
import VlcPlayerView from "../../vlc-player/src/VlcPlayerView";
import {
  downloadHLSAsset,
  useDownloadComplete,
  useDownloadError,
  useDownloadProgress,
} from "../src/ExpoHlsDownloader";

/**
 * Parses boot.xml in the root download directory to extract the stream folder name.
 */
async function getStreamFolderFromBootXml(
  downloadDir: string
): Promise<string | null> {
  try {
    const bootPath = `${downloadDir}/boot.xml`;
    const bootInfo = await FileSystem.getInfoAsync(bootPath);
    if (!bootInfo.exists) {
      console.error("boot.xml not found in", downloadDir);
      return null;
    }
    const xmlContent = await FileSystem.readAsStringAsync(bootPath);
    const match = xmlContent.match(/<Stream\s+[^>]*Path="([^"]+)"/);
    return match ? match[1].trim() : null;
  } catch (error) {
    console.error("Error reading boot.xml:", error);
    return null;
  }
}

/**
 * Parses the StreamInfoBoot.xml file in the stream folder and returns a mapping:
 * TS filename -> local fragment filename.
 */
async function parseStreamInfoMapping(
  downloadDir: string,
  streamFolder: string
): Promise<Record<string, string>> {
  const mapping: Record<string, string> = {};
  try {
    const streamInfoPath = `${downloadDir}/${streamFolder}/StreamInfoBoot.xml`;
    const info = await FileSystem.getInfoAsync(streamInfoPath);
    if (!info.exists) {
      console.error("StreamInfoBoot.xml not found in", streamFolder);
      return mapping;
    }
    const xmlContent = await FileSystem.readAsStringAsync(streamInfoPath);
    // Use a regex to match all <SEG ...> elements and capture PATH and URL attributes.
    const segRegex = /<SEG\s+[^>]*PATH="([^"]+)"\s+[^>]*URL="([^"]+)"[^>]*>/g;
    let match: RegExpExecArray | null;
    while ((match = segRegex.exec(xmlContent)) !== null) {
      const fragName = match[1].trim();
      const urlAttr = match[2].trim();
      // Extract the TS filename from the URL (assumes it's the last path component)
      const tsFilename = urlAttr.substring(urlAttr.lastIndexOf("/") + 1);
      mapping[tsFilename] = fragName;
    }
  } catch (error) {
    console.error("Error parsing StreamInfoBoot.xml:", error);
  }
  return mapping;
}

/**
 * Reads the master playlist, replaces TS filenames with local fragment paths from the mapping,
 * and writes the modified playlist to a new file.
 * @param masterUri Absolute path to the original master playlist.
 * @param baseDir The stream folder directory.
 * @param mapping Mapping from TS filename to fragment filename.
 * @returns The new file URI for the modified playlist.
 */
async function rewriteMasterPlaylist(
  masterUri: string,
  baseDir: string,
  mapping: Record<string, string>
): Promise<string> {
  try {
    const content = await FileSystem.readAsStringAsync(masterUri);
    const lines = content.split("\n");
    const modifiedLines = lines.map((line) => {
      // Only modify lines that look like segment references (not comments)
      if (!line.startsWith("#") && line.trim().endsWith(".ts")) {
        const tsFilename = line.trim();
        if (mapping[tsFilename]) {
          // Replace with absolute path to the frag file.
          return baseDir + "/" + mapping[tsFilename];
        }
        // Fallback: use the TS filename with baseDir prefix.
        return baseDir + "/" + tsFilename;
      }
      return line;
    });
    const newContent = modifiedLines.join("\n");
    const newUri = masterUri.replace(/\.m3u8$/, "_modified.m3u8");
    await FileSystem.writeAsStringAsync(newUri, newContent);
    console.log("Rewritten master playlist saved to:", newUri);
    return newUri;
  } catch (error) {
    console.error("Error rewriting master playlist:", error);
    throw error;
  }
}

/**
 * Reads the root boot.xml to get the stream folder, then reads StreamInfoBoot.xml to extract
 * the master playlist filename from <DataItem><Name>master.m3u8</Name> or from the MediaPlaylist.
 * For simplicity, here we assume that the master playlist file is in the stream folder.
 */
async function getMasterPlaylistUri(
  downloadDir: string,
  streamFolder: string
): Promise<string | null> {
  try {
    // Look in the stream folder for a file ending with ".m3u8"
    const folderPath = `${downloadDir}/${streamFolder}`;
    const items = await FileSystem.readDirectoryAsync(folderPath);
    const masterFile = items.find((f) => f.toLowerCase().endsWith(".m3u8"));
    if (!masterFile) {
      console.error("No master playlist found in", folderPath);
      return null;
    }
    return folderPath + "/" + masterFile;
  } catch (error) {
    console.error("Error reading master playlist:", error);
    return null;
  }
}

export default function App() {
  const progress = useDownloadProgress();
  const error = useDownloadError();
  const downloadLocation = useDownloadComplete("video-dir");
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const { width } = Dimensions.get("window");

  useEffect(() => {
    async function preparePlayback() {
      if (!downloadLocation) return;
      console.log("Download folder:", downloadLocation);

      // 1. Read boot.xml to get the stream folder.
      const streamFolder = await getStreamFolderFromBootXml(downloadLocation);
      if (!streamFolder) {
        console.error("Stream folder not found in boot.xml");
        return;
      }
      console.log("Stream folder:", streamFolder);

      // 2. Parse StreamInfoBoot.xml to build mapping TS -> frag.
      const mapping = await parseStreamInfoMapping(
        downloadLocation,
        streamFolder
      );
      console.log("Mapping:", mapping);

      // 3. Get the master playlist file URI from the stream folder.
      const masterUri = await getMasterPlaylistUri(
        downloadLocation,
        streamFolder
      );
      if (!masterUri) {
        console.error("Master playlist not found.");
        return;
      }
      console.log("Master playlist found at:", masterUri);

      // 4. Rewrite the master playlist using the mapping.
      const baseDir = `${downloadLocation}/${streamFolder}`;
      const modifiedMasterUri = await rewriteMasterPlaylist(
        masterUri,
        baseDir,
        mapping
      );

      console.log("setPlaybackUrl: ", modifiedMasterUri);
      setPlaybackUrl(modifiedMasterUri);
    }
    preparePlayback();
  }, [downloadLocation]);

  const handleDownload = () => {
    // Start the HLS download with a sample URL and asset title.
    downloadHLSAsset(
      "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.mp4/.m3u8",
      // "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
      // "https://fredflix.se/videos/48129b3e-eb6c-5b35-a3f0-5aa4519f20e9/master.m3u8?DeviceId=TW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyNS4wLjAuMCBTYWZhcmkvNTM3LjM2fDE3MTc2MjEwNjI2MDE1&MediaSourceId=48129b3eeb6c5b35a3f05aa4519f20e9&VideoCodec=av1,hevc,h264,vp9&AudioCodec=aac,opus,flac&AudioStreamIndex=1&VideoBitrate=226308506&AudioBitrate=191999&MaxFramerate=23.976025&PlaySessionId=110e05ff016a4778864a5e736b234ef9&api_key=9a506def548b4684a74a5ab410604de2&SubtitleMethod=Encode&TranscodingMaxAudioChannels=2&RequireAvc=false&EnableAudioVbrEncoding=true&Tag=40a3a2b4cb21057a5e1ea5f018b0c189&SegmentContainer=mp4&MinSegments=2&BreakOnNonKeyFrames=True&hevc-level=120&hevc-videobitdepth=10&hevc-profile=main10&av1-profile=main&av1-rangetype=SDR,HDR10,HLG&av1-level=19&vp9-rangetype=SDR,HDR10,HLG&hevc-rangetype=SDR,HDR10,HLG&hevc-deinterlace=true&h264-profile=high,main,baseline,constrainedbaseline,high10&h264-rangetype=SDR&h264-level=52&h264-deinterlace=true&TranscodeReasons=ContainerNotSupported,%20AudioChannelsNotSupported",
      "MyHLSAsset"
    );
  };

  const downloading = useMemo(() => progress > 0 && progress < 1, [progress]);
  const videoRef = useRef<VlcPlayerViewRef>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HLS Downloader Example</Text>
      <Button
        disabled={downloading}
        title={downloading ? "Downloading..." : "Download HLS Stream"}
        onPress={handleDownload}
      />
      <Text style={styles.text}>Progress: {(progress * 100).toFixed(2)}%</Text>
      {error ? <Text style={styles.error}>Error: {error}</Text> : null}
      {playbackUrl ? (
        <Text style={styles.text}>Download Complete: {playbackUrl}</Text>
      ) : null}
      <View
        style={{
          backgroundColor: "gray",
          width,
          height: 300,
        }}
      >
        {playbackUrl ? (
          <VlcPlayerView
            ref={videoRef}
            source={{
              uri: playbackUrl,
              autoplay: true,
              isNetwork: true,
            }}
            style={{ width: "100%", height: "100%" }}
            progressUpdateInterval={1000}
            onVideoLoadStart={() => {}}
            onVideoLoadEnd={() => {
              console.log("Video Load End");
            }}
            onVideoError={(e) => {
              console.error("Video Error:", e.nativeEvent);
            }}
          />
        ) : (
          <Text>No playback URL</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    marginBottom: 16,
  },
  text: {
    fontSize: 18,
    marginTop: 8,
  },
  error: {
    fontSize: 18,
    marginTop: 8,
    color: "red",
  },
});
