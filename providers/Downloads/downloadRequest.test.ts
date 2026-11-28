import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  buildDownloadRequest,
  downloadTracksFor,
  lacksMediaSource,
} from "./downloadRequest";

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

describe("buildDownloadRequest", () => {
  const api = makeApi();
  const MAX = { key: "Max", value: undefined };

  /** An episode whose default tracks are told apart by its number. */
  const episode = (number: number): BaseItemDto => ({
    Id: `episode-${number}`,
    Type: "Episode",
    MediaSources: [
      {
        Id: `source-${number}`,
        DefaultAudioStreamIndex: number,
        DefaultSubtitleStreamIndex: number + 10,
        MediaStreams: [
          { Type: "Audio", Index: number },
          { Type: "Subtitle", Index: number + 10 },
        ],
      },
    ],
  });

  test("uses the sheet's choices for a single item", () => {
    const request = buildDownloadRequest({
      api,
      userId: "user-1",
      item: episode(1),
      batch: false,
      selected: {
        bitrate: { key: "4mbps", value: 4_000_000 },
        mediaSource: { Id: "v2" },
        audioIndex: 2,
        subtitleIndex: 5,
      },
      defaultBitrate: MAX,
      settings: null,
    });

    expect(request).toMatchObject({
      mediaSourceId: "v2",
      audioStreamIndex: 2,
      subtitleStreamIndex: 5,
      maxStreamingBitrate: 4_000_000,
    });
  });

  test("uses each episode's defaults in a batch", () => {
    const request = buildDownloadRequest({
      api,
      userId: "user-1",
      item: episode(3),
      batch: true,
      selected: {
        bitrate: MAX,
        mediaSource: { Id: "picked-on-another-episode" },
        audioIndex: 0,
        subtitleIndex: 0,
      },
      defaultBitrate: MAX,
      settings: null,
    });

    expect(request).toMatchObject({
      mediaSourceId: "source-3",
      audioStreamIndex: 3,
      subtitleStreamIndex: 13,
    });
  });

  test("sends -1 for no audio or subtitle choice", () => {
    const request = buildDownloadRequest({
      api,
      userId: "user-1",
      item: episode(1),
      batch: false,
      selected: {
        bitrate: MAX,
        mediaSource: { Id: "source-1" },
        audioIndex: undefined,
        subtitleIndex: -1,
      },
      defaultBitrate: MAX,
      settings: null,
    });

    expect(request).toMatchObject({
      audioStreamIndex: -1,
      subtitleStreamIndex: -1,
    });
  });
});

describe("downloadTracksFor", () => {
  // The download records these, and a stored audio index left unset falls back
  // to the first track offline (pendingDownloads.ts); -1 would not.
  test("keeps an unpicked audio track unset for the download's record", () => {
    const tracks = downloadTracksFor({
      item: { Id: "movie-1", Type: "Movie" },
      batch: false,
      selected: {
        bitrate: { key: "Max", value: undefined },
        mediaSource: { Id: "source-1" },
        audioIndex: undefined,
        subtitleIndex: -1,
      },
      settings: null,
    });

    expect(tracks.audioIndex).toBeUndefined();
    expect(tracks.mediaSource?.Id).toBe("source-1");
  });
});
