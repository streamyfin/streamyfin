import {
  isLocalSubtitleIndex,
  LOCAL_SUBTITLE_INDEX_BASE,
  localSubtitleIndex,
  localSubtitlePosition,
  SUBTITLES_OFF,
  toServerSubtitleIndex,
} from "./subtitleIndex";

describe("isLocalSubtitleIndex", () => {
  it("rejects the values that share the number space", () => {
    // Real Jellyfin stream indexes and "off" must never be read as sidecars —
    // this is the aliasing that made a subtitle pick persist as "off".
    expect(isLocalSubtitleIndex(0)).toBe(false);
    expect(isLocalSubtitleIndex(7)).toBe(false);
    expect(isLocalSubtitleIndex(SUBTITLES_OFF)).toBe(false);
    expect(isLocalSubtitleIndex(-99)).toBe(false);
  });

  it("accepts the sidecar block", () => {
    expect(isLocalSubtitleIndex(LOCAL_SUBTITLE_INDEX_BASE)).toBe(true);
    expect(isLocalSubtitleIndex(localSubtitleIndex(0))).toBe(true);
    expect(isLocalSubtitleIndex(localSubtitleIndex(5))).toBe(true);
  });

  it("still recognises the retired -1000 native sentinel", () => {
    // A session or route param minted before the two encodings were merged
    // must not come back as a server stream index.
    expect(isLocalSubtitleIndex(-1000)).toBe(true);
  });

  it("treats absent and non-numeric input as not-local", () => {
    expect(isLocalSubtitleIndex(undefined)).toBe(false);
    expect(isLocalSubtitleIndex(null)).toBe(false);
    // A blank route param parses to NaN; it must fall through unchanged rather
    // than be mistaken for a sidecar.
    expect(isLocalSubtitleIndex(Number.NaN)).toBe(false);
  });
});

describe("localSubtitleIndex / localSubtitlePosition", () => {
  it("round-trips every position", () => {
    for (const position of [0, 1, 2, 17]) {
      expect(localSubtitlePosition(localSubtitleIndex(position))).toBe(
        position,
      );
    }
  });

  it("gives each sidecar a distinct index", () => {
    // The block exists precisely so carry-over knows *which* sidecar was
    // showing; a single shared sentinel could not.
    const indexes = [0, 1, 2].map(localSubtitleIndex);
    expect(new Set(indexes).size).toBe(3);
  });
});

describe("toServerSubtitleIndex", () => {
  it("passes server stream indexes through", () => {
    expect(toServerSubtitleIndex(0)).toBe(0);
    expect(toServerSubtitleIndex(4)).toBe(4);
    expect(toServerSubtitleIndex(SUBTITLES_OFF)).toBe(SUBTITLES_OFF);
  });

  it("maps every sidecar to off", () => {
    // A sidecar has no server identity; re-negotiating while one shows must ask
    // for "no subtitles" or the server picks an unrelated stream.
    expect(toServerSubtitleIndex(localSubtitleIndex(0))).toBe(SUBTITLES_OFF);
    expect(toServerSubtitleIndex(localSubtitleIndex(3))).toBe(SUBTITLES_OFF);
    expect(toServerSubtitleIndex(-1000)).toBe(SUBTITLES_OFF);
  });

  it("maps absent input to off", () => {
    expect(toServerSubtitleIndex(undefined)).toBe(SUBTITLES_OFF);
    expect(toServerSubtitleIndex(null)).toBe(SUBTITLES_OFF);
  });
});
