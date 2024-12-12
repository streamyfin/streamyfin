import { TranscodedSubtitle } from "@/components/video-player/controls/types";
import { TrackInfo } from "@/modules/vlc-player";
import { MediaStream } from "@jellyfin/sdk/lib/generated-client";
import { Platform } from "react-native";

const disableSubtitle = {
  name: "Disable",
  index: -1,
  IsTextSubtitleStream: true,
} as TranscodedSubtitle;

export class SubtitleHelper {
  private mediaStreams: MediaStream[];

  constructor(mediaStreams: MediaStream[]) {
    this.mediaStreams = mediaStreams.filter((x) => x.Type === "Subtitle");
  }

  getSubtitles(): MediaStream[] {
    return this.mediaStreams;
  }

  getUniqueSubtitles(): MediaStream[] {
    const uniqueSubs: MediaStream[] = [];
    const seen = new Set<string>();

    this.mediaStreams.forEach((x) => {
      if (!seen.has(x.DisplayTitle!)) {
        seen.add(x.DisplayTitle!);
        uniqueSubs.push(x);
      }
    });

    return uniqueSubs;
  }

  getCurrentSubtitle(subtitleIndex?: number): MediaStream | undefined {
    return this.mediaStreams.find((x) => x.Index === subtitleIndex);
  }

  getMostCommonSubtitleByName(
    subtitleIndex: number | undefined
  ): number | undefined {
    if (subtitleIndex === undefined) -1;
    const uniqueSubs = this.getUniqueSubtitles();
    const currentSub = this.getCurrentSubtitle(subtitleIndex);

    return uniqueSubs.find((x) => x.DisplayTitle === currentSub?.DisplayTitle)
      ?.Index;
  }

  getTextSubtitles(): MediaStream[] {
    return this.mediaStreams.filter((x) => x.IsTextSubtitleStream);
  }

  getImageSubtitles(): MediaStream[] {
    return this.mediaStreams.filter((x) => !x.IsTextSubtitleStream);
  }

  getEmbeddedTrackIndex(sourceSubtitleIndex: number): number {
    if (Platform.OS === "android") {
      const textSubs = this.getTextSubtitles();
      const matchingSubtitle = textSubs.find(
        (sub) => sub.Index === sourceSubtitleIndex
      );

      if (!matchingSubtitle) return -1;
      return textSubs.indexOf(matchingSubtitle);
    }

    // Get unique text-based subtitles because react-native-video removes hls text tracks duplicates. (iOS)
    const uniqueTextSubs = this.getUniqueTextBasedSubtitles();
    const matchingSubtitle = uniqueTextSubs.find(
      (sub) => sub.Index === sourceSubtitleIndex
    );

    if (!matchingSubtitle) return -1;
    return uniqueTextSubs.indexOf(matchingSubtitle);
  }

  sortSubtitles(
    textSubs: TranscodedSubtitle[],
    allSubs: MediaStream[]
  ): TranscodedSubtitle[] {
    let textIndex = 0; // To track position in textSubtitles
    // Merge text and image subtitles in the order of allSubs
    const sortedSubtitles = allSubs.map((sub) => {
      if (sub.IsTextSubtitleStream) {
        if (textSubs.length === 0) return disableSubtitle;
        const textSubtitle = textSubs[textIndex];
        if (!textSubtitle) return disableSubtitle;
        textIndex++;
        return textSubtitle;
      } else {
        return {
          name: sub.DisplayTitle!,
          index: sub.Index!,
          IsTextSubtitleStream: sub.IsTextSubtitleStream,
        } as TranscodedSubtitle;
      }
    });

    return sortedSubtitles;
  }

  getSortedSubtitles(subtitleTracks: TrackInfo[]): TranscodedSubtitle[] {
    const textSubtitles =
      subtitleTracks.map((s) => ({
        name: s.name,
        index: s.index,
        IsTextSubtitleStream: true,
      })) || [];

    const sortedSubs =
      Platform.OS === "android"
        ? this.sortSubtitles(textSubtitles, this.mediaStreams)
        : this.sortSubtitles(textSubtitles, this.getUniqueSubtitles());

    return sortedSubs;
  }

  getUniqueTextBasedSubtitles(): MediaStream[] {
    return this.getUniqueSubtitles().filter((x) => x.IsTextSubtitleStream);
  }

  // HLS stream indexes are not the same as the actual source indexes.
  // This function aims to get the source subtitle index from the embedded track index.
  getSourceSubtitleIndex = (embeddedTrackIndex: number): number => {
    if (Platform.OS === "android") {
      return this.getSubtitles()[embeddedTrackIndex]?.Index ?? -1;
    }
    return this.getUniqueTextBasedSubtitles()[embeddedTrackIndex]?.Index ?? -1;
  };
}
