import type {
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  AudioStreamRanker,
  StreamRanker,
  SubtitleStreamRanker,
} from "./streamRanker";

const video: MediaStream = { Type: "Video", Index: 0 };
const subtitle = (Index: number, Language: string): MediaStream => ({
  Type: "Subtitle",
  Index,
  Language,
  Codec: "subrip",
  DisplayTitle: `${Language} - SUBRIP`,
});
const audio = (
  Index: number,
  Language: string,
  Codec: string,
  DisplayTitle: string,
): MediaStream => ({ Type: "Audio", Index, Language, Codec, DisplayTitle });

const rank = (
  ranker: StreamRanker,
  prevIndex: number,
  prevSource: MediaSourceInfo,
  streams: MediaStream[],
) => {
  const result: { index?: number; matched: boolean } = { matched: false };
  const options: Record<string, unknown> = { matched: false };
  ranker.rankStream(prevIndex, prevSource, streams, options);
  result.matched = options.matched === true;
  result.index = (options.DefaultSubtitleStreamIndex ??
    options.DefaultAudioStreamIndex) as number | undefined;
  return result;
};

describe("StreamRanker", () => {
  // A library that keeps text subtitles only drops the image track and leaves
  // its Index unused, so a stream's Index is not its place in the list.
  const gapped: MediaSourceInfo = {
    MediaStreams: [
      video,
      audio(1, "eng", "aac", "English - AAC"),
      subtitle(3, "eng"),
      subtitle(4, "fre"),
    ],
  };
  const next = [
    video,
    audio(1, "eng", "aac", "English - AAC"),
    subtitle(2, "eng"),
    subtitle(3, "fre"),
  ];

  test("finds the previous track by its Index, not by its place in the list", () => {
    const ranker = new StreamRanker(new SubtitleStreamRanker());

    expect(rank(ranker, 3, gapped, next)).toEqual({ index: 2, matched: true });
    expect(rank(ranker, 4, gapped, next)).toEqual({ index: 3, matched: true });
  });
});

describe("AudioStreamRanker", () => {
  const encode: MediaSourceInfo = {
    MediaStreams: [
      video,
      audio(1, "eng", "aac", "English - AAC - Stereo"),
      audio(2, "fre", "aac", "French - AAC - Stereo"),
    ],
  };

  // A remux of the same film: other codec, other title, French first. The
  // language alone scored 2, under the threshold of 3, so the pick was lost.
  test("keeps the language on a track encoded differently", () => {
    const remux = [
      video,
      audio(1, "fre", "truehd", "French - TRUEHD - 7.1"),
      audio(2, "eng", "truehd", "English - TRUEHD - 7.1"),
    ];

    expect(
      rank(new StreamRanker(new AudioStreamRanker()), 2, encode, remux),
    ).toEqual({ index: 1, matched: true });
  });

  test("does not take another language for the one picked", () => {
    const englishAndGerman = [
      video,
      audio(1, "eng", "aac", "English - AAC - Stereo"),
      audio(2, "ger", "aac", "German - AAC - Stereo"),
    ];

    expect(
      rank(
        new StreamRanker(new AudioStreamRanker()),
        2,
        encode,
        englishAndGerman,
      ).matched,
    ).toBe(false);
  });
});
