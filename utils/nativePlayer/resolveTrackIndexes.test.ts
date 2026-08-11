import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  BaseItemDto,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";

const store = new Map<string, string>();
mock.module("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (k: string) => store.get(k),
    set: (k: string, v: string) => void store.set(k, v),
    delete: (k: string) => void store.delete(k),
  }),
}));
mock.module("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));

const { resolveTrackIndexes } = await import("./resolveTrackIndexes");

const stream = (
  type: "Audio" | "Subtitle",
  index: number,
  language?: string,
): MediaStream => ({ Type: type, Index: index, Language: language });

const item = (
  sources: { id: string; streams: MediaStream[]; defaultSub?: number }[],
): BaseItemDto => ({
  Id: "i1",
  Type: "Movie",
  MediaSources: sources.map((s) => ({
    Id: s.id,
    MediaStreams: s.streams,
    DefaultSubtitleStreamIndex: s.defaultSub,
  })),
});

const settings = {} as Settings;

const simple = item([
  {
    id: "src-1",
    streams: [stream("Audio", 1, "eng"), stream("Subtitle", 2, "eng")],
    defaultSub: 2,
  },
]);

beforeEach(() => store.clear());

describe("offline", () => {
  test("uses the download record rather than the server media source", () => {
    // The regression this exists for: a downloaded item started with no
    // subtitle regardless of what was chosen at download time, because the
    // record was never consulted.
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: true,
      downloaded: { audioStreamIndex: 3, subtitleStreamIndex: 4 },
      requested: {},
    });
    expect(result).toEqual({ audioIndex: 3, subtitleIndex: 4 });
  });

  test("honours a download that pinned no subtitle", () => {
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: true,
      downloaded: { audioStreamIndex: 1, subtitleStreamIndex: -1 },
      requested: {},
    });
    expect(result.subtitleIndex).toBe(-1);
  });

  test("never resolves against the server source offline", () => {
    // A transcoded download holds a subset of streams; the server's default
    // could name one the local file does not contain.
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: true,
      downloaded: {},
      requested: {},
    });
    expect(result.subtitleIndex).toBe(-1);
    expect(result.audioIndex).toBeUndefined();
  });

  test("an explicit request still wins over the record", () => {
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: true,
      downloaded: { audioStreamIndex: 3, subtitleStreamIndex: 4 },
      requested: { audioIndex: 9, subtitleIndex: 8 },
    });
    expect(result).toEqual({ audioIndex: 9, subtitleIndex: 8 });
  });
});

describe("online", () => {
  test("passes an explicit request straight through", () => {
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: false,
      requested: { audioIndex: 1, subtitleIndex: 2 },
    });
    expect(result).toEqual({ audioIndex: 1, subtitleIndex: 2 });
  });

  test("resolves for a caller that supplied nothing", () => {
    // Top shelf, WebSocket Play commands and bare playMedia({ itemId }) used to
    // fall through to the server defaults, bypassing series memory entirely.
    const result = resolveTrackIndexes({
      item: simple,
      settings,
      offline: false,
      requested: {},
    });
    expect(result.subtitleIndex).toBe(2);
  });

  test("resolves against the named media source, not always the first", () => {
    // Stream indexes are per-source; version 1's numbering does not apply to
    // version 2.
    const multi = item([
      { id: "src-1", streams: [stream("Subtitle", 2)], defaultSub: 2 },
      { id: "src-2", streams: [stream("Subtitle", 7)], defaultSub: 7 },
    ]);
    const result = resolveTrackIndexes({
      item: multi,
      settings,
      offline: false,
      requested: { mediaSourceId: "src-2" },
    });
    expect(result.subtitleIndex).toBe(7);
  });

  test("falls back to subtitles off when nothing resolves", () => {
    const bare = item([{ id: "src-1", streams: [] }]);
    const result = resolveTrackIndexes({
      item: bare,
      settings,
      offline: false,
      requested: {},
    });
    expect(result.subtitleIndex).toBe(-1);
  });
});
