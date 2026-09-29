import { describe, expect, test } from "bun:test";
import { mergeLocalPlaybackRequest, toDirectPlayerQuery } from "./playRequest";

describe("native-to-React playback fallback", () => {
  test("only matching local stream choices merge into server-controlled playback", () => {
    const request = {
      itemId: "selected",
      offline: false,
      syncPlay: true,
      playbackPositionTicks: 100,
    };
    const choices = {
      itemId: "selected",
      offline: false,
      audioIndex: 0,
      subtitleIndex: -1,
      mediaSourceId: "version-2",
      bitrateValue: 10_000,
    };
    expect(mergeLocalPlaybackRequest(request, choices)).toEqual({
      ...request,
      audioIndex: 0,
      subtitleIndex: -1,
      mediaSourceId: "version-2",
      bitrateValue: 10_000,
    });
    expect(
      mergeLocalPlaybackRequest(request, { ...choices, itemId: "other" }),
    ).toBe(request);
  });

  test("preserves the server-driven SyncPlay flag and downloaded source", () => {
    const query = new URLSearchParams(
      toDirectPlayerQuery({
        itemId: "episode-1",
        playbackPositionTicks: 123_450_000,
        offline: true,
        syncPlay: true,
      }),
    );
    expect(query.get("syncPlay")).toBe("true");
    expect(query.get("playbackPosition")).toBe("123450000");
    expect(query.get("offline")).toBe("true");
  });

  test("ordinary playback does not acquire SyncPlay semantics", () => {
    const query = new URLSearchParams(
      toDirectPlayerQuery({
        itemId: "movie-1",
        offline: false,
        audioIndex: 0,
        subtitleIndex: -1,
      }),
    );
    expect(query.has("syncPlay")).toBe(false);
    expect(query.get("audioIndex")).toBe("0");
    expect(query.get("subtitleIndex")).toBe("-1");
    expect(query.get("offline")).toBe("false");
  });
});
