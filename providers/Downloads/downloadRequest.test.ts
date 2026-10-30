import type {
  MediaSourceInfo,
  MediaStreamType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { DOWNLOAD_VIDEO_CODECS } from "@/constants/Downloads";
import type { Settings } from "@/utils/atoms/settings";
import {
  defaultBurnIn,
  downloadDefaults,
  downloadSubtitleIndexes,
  lacksMediaSource,
  offersAudioChoice,
  subtitleStreams,
  transcodeLosesTracks,
  videoCodecLabel,
} from "./downloadRequest";

// The real module renders a dropdown, which loads the bottom sheet.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [
    { key: "Max", value: undefined },
    { key: "8 Mb/s", value: 8000000 },
  ],
}));

const MAX = { key: "Max", value: undefined };
const CAPPED = { key: "8 Mb/s", value: 8000000 };

const sourceWith = (...types: MediaStreamType[]): MediaSourceInfo => ({
  Id: "source-1",
  MediaStreams: types.map((Type, Index) => ({ Type, Index })),
});

describe("downloadDefaults", () => {
  test("starts on the original file at Max before anything is set", () => {
    expect(downloadDefaults(null)).toEqual({
      mode: "original",
      bitrate: MAX,
      videoCodec: "auto",
      audioMode: "auto",
    });
  });

  test("starts on the download defaults, not the playback ones", () => {
    const settings = {
      defaultBitrate: CAPPED,
      audioTranscodeMode: "5.1",
      downloadMode: "transcode",
      defaultDownloadBitrate: MAX,
      downloadVideoCodec: "hevc",
      downloadAudioTranscodeMode: "stereo",
    } as Settings;
    expect(downloadDefaults(settings)).toEqual({
      mode: "transcode",
      bitrate: MAX,
      videoCodec: "hevc",
      audioMode: "stereo",
    });
  });

  // Someone who set stereo for playback had downloads transcoded to stereo too.
  test("keeps the playback audio channels until downloads get their own", () => {
    const settings = { audioTranscodeMode: "stereo" } as Settings;
    expect(downloadDefaults(settings).audioMode).toBe("stereo");
  });
});

describe("offersAudioChoice", () => {
  test("offers a pick between several audio tracks", () => {
    expect(offersAudioChoice(sourceWith("Video", "Audio", "Audio"))).toBe(true);
  });

  test("offers none when there is a single audio track", () => {
    expect(offersAudioChoice(sourceWith("Video", "Audio"))).toBe(false);
  });
});

describe("transcodeLosesTracks", () => {
  test("warns about a source with several audio tracks", () => {
    expect(transcodeLosesTracks(sourceWith("Video", "Audio", "Audio"))).toBe(
      true,
    );
  });

  test("warns about a source with several video tracks", () => {
    expect(transcodeLosesTracks(sourceWith("Video", "Video", "Audio"))).toBe(
      true,
    );
  });

  // Subtitles are not counted: text ones come down as sidecar files either way.
  test("says nothing when there is one track of each to keep", () => {
    expect(
      transcodeLosesTracks(
        sourceWith("Video", "Audio", "Subtitle", "Subtitle"),
      ),
    ).toBe(false);
  });
});

describe("lacksMediaSource", () => {
  // Sentry REACT-NATIVE-FX: the server lists no media source for an item it
  // cannot play (a folder, a photo, a book), the download sheet opened all the
  // same, and confirming it threw "No api or user or item".
  test("turns down a single item the server gave no media source for", () => {
    expect(lacksMediaSource(1, undefined)).toBe(true);
  });

  test("turns down a single item whose media source has no id", () => {
    expect(lacksMediaSource(1, { Name: "1080p" })).toBe(true);
  });

  test("lets a single item with a media source through", () => {
    expect(lacksMediaSource(1, { Id: "source-1" })).toBe(false);
  });

  // The sheet only holds a source for a single item. Each episode of a season
  // resolves its own once the download starts, so none is needed up front.
  test("asks nothing of a download of several items", () => {
    expect(lacksMediaSource(2, undefined)).toBe(false);
  });
});

describe("burning in a subtitle", () => {
  // Index 1 is an image subtitle (PGS), 2 and 3 are text ones.
  const source: MediaSourceInfo = {
    Id: "source-1",
    MediaStreams: [
      { Type: "Video", Index: 0 },
      {
        Type: "Subtitle",
        Index: 1,
        Codec: "PGSSUB",
        IsTextSubtitleStream: false,
      },
      { Type: "Subtitle", Index: 2, Codec: "srt", IsTextSubtitleStream: true },
      { Type: "Subtitle", Index: 3, Codec: "ass", IsTextSubtitleStream: true },
    ],
  };

  test("offers every subtitle, image and text", () => {
    expect(subtitleStreams(source).map((s) => s.Index)).toEqual([1, 2, 3]);
  });

  test("offers nothing when there is no subtitle", () => {
    expect(subtitleStreams(sourceWith("Video", "Audio"))).toEqual([]);
  });

  // A transcode cannot carry an image subtitle as a track: unless it is burned
  // in, the one the user prefers is lost.
  test("starts on the preferred subtitle when it is an image one", () => {
    expect(defaultBurnIn(source, 1)).toBe(1);
  });

  test("starts on none when the preferred subtitle is a text one", () => {
    expect(defaultBurnIn(source, 2)).toBe(-1);
  });

  test("an original asks for and plays the preferred subtitle", () => {
    expect(
      downloadSubtitleIndexes({
        mode: "original",
        mediaSource: source,
        preferredIndex: 1,
        burnInIndex: -1,
      }),
    ).toEqual({ requested: 1, playedOffline: 1 });
  });

  test("a transcode asks for the subtitle to burn in and plays it", () => {
    expect(
      downloadSubtitleIndexes({
        mode: "transcode",
        mediaSource: source,
        preferredIndex: 2,
        burnInIndex: 3,
      }),
    ).toEqual({ requested: 3, playedOffline: 3 });
  });

  // Asking for the preferred text subtitle would burn it in.
  test("a transcode without a burn-in asks for none and plays the preferred text subtitle", () => {
    expect(
      downloadSubtitleIndexes({
        mode: "transcode",
        mediaSource: source,
        preferredIndex: 2,
        burnInIndex: -1,
      }),
    ).toEqual({ requested: -1, playedOffline: 2 });
  });

  test("a transcode without a burn-in drops a preferred image subtitle it cannot carry", () => {
    expect(
      downloadSubtitleIndexes({
        mode: "transcode",
        mediaSource: source,
        preferredIndex: 1,
        burnInIndex: -1,
      }),
    ).toEqual({ requested: -1, playedOffline: -1 });
  });
});

describe("videoCodecLabel", () => {
  const t = (key: string) => `t:${key}`;

  test("translates Auto and leaves codec names as they are", () => {
    expect(
      DOWNLOAD_VIDEO_CODECS.map((codec) => videoCodecLabel(codec, t)),
    ).toEqual(["t:item_card.download.video_codec_auto", "H.264", "HEVC"]);
  });
});
