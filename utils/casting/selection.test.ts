import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  resolveDefaultAudioIndex,
  resolveSelection,
  selectionsEqual,
} from "./selection";

const item: BaseItemDto = {
  Id: "item-1",
  MediaSources: [
    {
      Id: "src-a",
      DefaultAudioStreamIndex: 2,
      DefaultSubtitleStreamIndex: 3,
      MediaStreams: [
        { Type: "Video", Index: 0 },
        { Type: "Audio", Index: 1, IsDefault: false },
        { Type: "Audio", Index: 2, IsDefault: true },
        { Type: "Subtitle", Index: 3 },
      ],
    },
    {
      Id: "src-b",
      MediaStreams: [
        { Type: "Video", Index: 0 },
        { Type: "Audio", Index: 1, IsDefault: false },
      ],
    },
  ],
};

describe("resolveDefaultAudioIndex", () => {
  test("uses the source's DefaultAudioStreamIndex when present", () => {
    expect(resolveDefaultAudioIndex(item, "src-a")).toBe(2);
  });

  test("falls back to the first audio stream when no default flag", () => {
    expect(resolveDefaultAudioIndex(item, "src-b")).toBe(1);
  });
});

describe("resolveSelection", () => {
  test("fills every field from server defaults of the first source", () => {
    const sel = resolveSelection(item, {});
    expect(sel.mediaSourceId).toBe("src-a");
    expect(sel.audioStreamIndex).toBe(2);
    expect(sel.subtitleStreamIndex).toBe(3);
    expect(sel.maxBitrate).toBeUndefined();
  });

  test("a partial overrides defaults and keeps the rest", () => {
    const sel = resolveSelection(item, {
      audioStreamIndex: 1,
      maxBitrate: 4_000_000,
    });
    expect(sel.audioStreamIndex).toBe(1);
    expect(sel.maxBitrate).toBe(4_000_000);
    expect(sel.subtitleStreamIndex).toBe(3);
  });

  test("switching version resolves that version's defaults", () => {
    const sel = resolveSelection(item, { mediaSourceId: "src-b" });
    expect(sel.mediaSourceId).toBe("src-b");
    expect(sel.audioStreamIndex).toBe(1);
    expect(sel.subtitleStreamIndex).toBe(-1);
  });
});

describe("selectionsEqual", () => {
  test("true for identical selections", () => {
    const a = {
      mediaSourceId: "s",
      audioStreamIndex: 1,
      subtitleStreamIndex: -1,
    };
    expect(selectionsEqual(a, { ...a })).toBe(true);
  });

  test("false when any field differs", () => {
    const a = {
      mediaSourceId: "s",
      audioStreamIndex: 1,
      subtitleStreamIndex: -1,
    };
    expect(selectionsEqual(a, { ...a, audioStreamIndex: 2 })).toBe(false);
  });
});
