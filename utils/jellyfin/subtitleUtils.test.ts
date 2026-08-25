import { describe, expect, test } from "bun:test";
import type {
  MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";
import {
  applyMpvSubtitleSelection,
  compareTracksForMenu,
  getExternalSubtitleUrl,
  isExternalSubtitle,
  type PlayerSubtitleTrack,
  pickAutoSubtitleTrack,
  requiresStreamRestart,
  resolveSubtitleTrack,
} from "@/utils/jellyfin/subtitleUtils";

// String-enum values as typed literals — avoids a runtime SDK import (see subtitleUtils.ts).
const External = "External" as SubtitleDeliveryMethod;
const Embed = "Embed" as SubtitleDeliveryMethod;
const Encode = "Encode" as SubtitleDeliveryMethod;
const Hls = "Hls" as SubtitleDeliveryMethod;

// --- fixtures --------------------------------------------------------------

const sub = (o: Partial<MediaStream> & { Index: number }): MediaStream =>
  ({ Type: "Subtitle", ...o }) as MediaStream;

const ext = (Index: number, o: Partial<MediaStream> = {}): MediaStream =>
  sub({
    Index,
    DeliveryMethod: External,
    IsExternal: true,
    DeliveryUrl: `/sub/${Index}.srt`,
    ...o,
  });

const emb = (Index: number, o: Partial<MediaStream> = {}): MediaStream =>
  sub({ Index, DeliveryMethod: Embed, ...o });

const track = (o: PlayerSubtitleTrack): PlayerSubtitleTrack => o;

// Mirror direct-player.tsx online URL builder.
const urlBuilder =
  (base: string) =>
  (s: MediaStream): string | undefined =>
    s.DeliveryUrl ? `${base}${s.DeliveryUrl}` : undefined;

const resolve = (
  streams: MediaStream[],
  index: number | undefined,
  player: PlayerSubtitleTrack[],
  getExpectedExternalUrl = urlBuilder("http://srv"),
) =>
  resolveSubtitleTrack({
    subtitleStreams: streams,
    jellyfinSubtitleIndex: index,
    playerTracks: player,
    getExpectedExternalUrl,
  });

// --- tests -----------------------------------------------------------------

describe("isExternalSubtitle", () => {
  test("true for External delivery or the IsExternal flag, not a bare DeliveryUrl", () => {
    expect(isExternalSubtitle(ext(0))).toBe(true);
    expect(isExternalSubtitle(sub({ Index: 1, IsExternal: true }))).toBe(true);
    expect(isExternalSubtitle(emb(2))).toBe(false);
    // A DeliveryUrl alone (e.g. an Hls-delivered sub) is NOT a sub-added sidecar.
    expect(isExternalSubtitle(sub({ Index: 3, DeliveryUrl: "/x.srt" }))).toBe(
      false,
    );
  });

  test("a sidecar re-delivered by the server (Hls/Encode) is NOT external", () => {
    // IsExternal only wins while no device-specific delivery method is assigned;
    // once the server picks Hls (inside the stream) or Encode (burned), the
    // track is not a sub-added sidecar and must not use the external path.
    expect(
      isExternalSubtitle(
        sub({ Index: 0, IsExternal: true, DeliveryMethod: Hls }),
      ),
    ).toBe(false);
    expect(
      isExternalSubtitle(
        sub({ Index: 0, IsExternal: true, DeliveryMethod: Encode }),
      ),
    ).toBe(false);
  });
});

describe("resolveSubtitleTrack — disable / notFound", () => {
  test("index -1 or undefined disables", () => {
    expect(resolve([], -1, [])).toEqual({ kind: "disable" });
    expect(resolve([], undefined, [])).toEqual({ kind: "disable" });
  });

  test("index not present returns notFound", () => {
    expect(resolve([emb(0)], 99, [track({ id: 1 })])).toEqual({
      kind: "notFound",
    });
  });
});

describe("resolveSubtitleTrack — hidden embedded (#954)", () => {
  // Server hides embedded subs: MediaStreams lists only the 3 externals,
  // but mpv still demuxes the 3 embedded from the file → externals get ids 4,5,6.
  const streams = [
    ext(0, { Language: "por" }),
    ext(1, { Language: "eng" }),
    ext(2, { Language: "eng", Title: "SDH" }),
  ];
  const player = [
    track({ id: 1, external: false, language: "eng", title: "CC" }),
    track({ id: 2, external: false, language: "spa" }),
    track({ id: 3, external: false, language: "fre" }),
    track({ id: 4, external: true, externalFilename: "http://srv/sub/0.srt" }),
    track({ id: 5, external: true, externalFilename: "http://srv/sub/1.srt" }),
    track({ id: 6, external: true, externalFilename: "http://srv/sub/2.srt" }),
  ];

  test("each external maps to the right player id by filename (not 1,2,3)", () => {
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 4 });
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 5 });
    expect(resolve(streams, 2, player)).toEqual({ kind: "select", trackId: 6 });
  });

  test("falls back to external ordinal when filenames are unavailable", () => {
    const noNames = player.map((t) =>
      t.external ? { ...t, externalFilename: undefined } : t,
    );
    expect(resolve(streams, 1, noNames)).toEqual({
      kind: "select",
      trackId: 5,
    });
  });
});

describe("resolveSubtitleTrack — external/embed reversal (non-hidden)", () => {
  // Jellyfin lists externals first; mpv lists embedded first then externals.
  const streams = [
    ext(0, { Language: "eng" }),
    emb(1, { Language: "spa" }),
    emb(2, { Language: "fre" }),
  ];
  const player = [
    track({ id: 1, external: false, language: "spa" }),
    track({ id: 2, external: false, language: "fre" }),
    track({ id: 3, external: true, externalFilename: "http://srv/sub/0.srt" }),
  ];

  test("external resolves by filename, embedded by language", () => {
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 3 });
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 1 });
    expect(resolve(streams, 2, player)).toEqual({ kind: "select", trackId: 2 });
  });
});

describe("resolveSubtitleTrack — external without DeliveryUrl (#1763 CodeRabbit)", () => {
  // Middle external has no DeliveryUrl → never loaded into the player.
  const streams = [
    ext(0, { Language: "eng", DeliveryUrl: "/sub/a.srt" }),
    sub({ Index: 1, DeliveryMethod: External, IsExternal: true }),
    ext(2, { Language: "fre", DeliveryUrl: "/sub/c.srt" }),
  ];
  const player = [
    track({ id: 4, external: true, externalFilename: "http://srv/sub/a.srt" }),
    track({ id: 5, external: true, externalFilename: "http://srv/sub/c.srt" }),
  ];

  test("loaded externals still map correctly despite the gap", () => {
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 4 });
    expect(resolve(streams, 2, player)).toEqual({ kind: "select", trackId: 5 });
  });

  test("selecting the unloaded external returns notFound", () => {
    expect(resolve(streams, 1, player)).toEqual({ kind: "notFound" });
  });
});

describe("resolveSubtitleTrack — embedded matching", () => {
  test("unique language match wins even when player order differs (not positional)", () => {
    const streams = [emb(0, { Language: "eng" }), emb(1, { Language: "jpn" })];
    // Player lists them in the OPPOSITE order — a positional map would mis-pick.
    const player = [
      track({ id: 1, external: false, language: "jpn" }),
      track({ id: 2, external: false, language: "eng" }),
    ];
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 2 }); // eng
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 1 }); // jpn
  });

  test("same-language tracks with no distinguishing title fall back to ordinal among matches", () => {
    const streams = [emb(0, { Language: "eng" }), emb(1, { Language: "eng" })];
    // Both eng, no title → identity can't disambiguate → ordinal among matches.
    const player = [
      track({ id: 5, external: false, language: "eng" }),
      track({ id: 6, external: false, language: "eng" }),
    ];
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 5 });
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 6 });
  });

  test("falls back to embedded ordinal when no language/title info", () => {
    const streams = [emb(0), emb(1)];
    const player = [
      track({ id: 1, external: false }),
      track({ id: 2, external: false }),
    ];
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 2 });
  });
});

describe("compareTracksForMenu — jellyfin-web order", () => {
  test("externals sort after embedded despite lower Index", () => {
    const sorted = [
      ext(0, { Language: "eng" }),
      emb(7, { Language: "fra" }),
    ].sort(compareTracksForMenu);
    expect(sorted.map((s) => s.Index)).toEqual([7, 0]);
  });

  test("forced then default float to the top within a group", () => {
    const sorted = [
      emb(2, { Language: "eng" }),
      emb(1, { Language: "eng", IsDefault: true }),
      emb(0, { Language: "eng", IsForced: true }),
    ].sort(compareTracksForMenu);
    expect(sorted.map((s) => s.Index)).toEqual([0, 1, 2]);
  });

  test("full Okiku order: embedded first, externals last by Index", () => {
    const streams = [
      ext(0, { Language: "eng" }),
      ext(1, { Language: "eng" }),
      ext(2, { Language: "fra" }),
      ext(3, { Language: "fra" }),
      emb(7, { Language: "fra", Title: "French" }),
    ];
    expect([...streams].sort(compareTracksForMenu).map((s) => s.Index)).toEqual(
      [7, 0, 1, 2, 3],
    );
  });
});

describe("resolveSubtitleTrack — same-identity group ordinal (duplicate languages)", () => {
  // [jpn, eng, eng] with no titles: the eng group starts at embedded position 1,
  // so the group ordinal (not the global one) must drive the pick.
  const streams = [
    emb(0, { Language: "jpn" }),
    emb(1, { Language: "eng" }),
    emb(2, { Language: "eng" }),
  ];
  const playerTracks = [
    track({ id: 1, language: "jpn" }),
    track({ id: 2, language: "eng" }),
    track({ id: 3, language: "eng" }),
  ];

  test("first eng selects the first matching player track", () => {
    expect(resolve(streams, 1, playerTracks)).toEqual({
      kind: "select",
      trackId: 2,
    });
  });

  test("second eng selects the second matching player track", () => {
    expect(resolve(streams, 2, playerTracks)).toEqual({
      kind: "select",
      trackId: 3,
    });
  });
});

describe("resolveSubtitleTrack — server-burned (Encode) streams", () => {
  const burned = emb(2, {
    DeliveryMethod: Encode,
    IsTextSubtitleStream: false,
    Codec: "pgssub",
  });

  test("selecting a burned-in sub returns burnedIn (a stream refresh, not a track)", () => {
    expect(resolve([burned, emb(3)], 2, [track({ id: 1 })])).toEqual({
      kind: "burnedIn",
    });
  });

  test("burned-in streams do not shift the embedded ordinal", () => {
    // Player only demuxes the two untagged text subs; the burned PGS is pixels.
    const streams = [burned, emb(3), emb(4)];
    const playerTracks = [track({ id: 1 }), track({ id: 2 })];
    expect(resolve(streams, 3, playerTracks)).toEqual({
      kind: "select",
      trackId: 1,
    });
    expect(resolve([burned, emb(3)], 3, [track({ id: 1 })])).toEqual({
      kind: "select",
      trackId: 1,
    });
  });
});

describe("resolveSubtitleTrack — Hls-delivered sidecar goes through the embedded path", () => {
  test("resolves by identity against the player's in-stream track", () => {
    const hlsSidecar = sub({
      Index: 0,
      IsExternal: true,
      DeliveryMethod: Hls,
      DeliveryUrl: "/videos/x/subs/0.vtt",
      Language: "fre",
    });
    const r = resolve([hlsSidecar, emb(1, { Language: "eng" })], 0, [
      track({ id: 1, language: "fre" }),
      track({ id: 2, language: "eng" }),
    ]);
    expect(r).toEqual({ kind: "select", trackId: 1 });
  });
});

describe("applyMpvSubtitleSelection — short-circuits", () => {
  test("disable (-1) never reads the player track list", async () => {
    let enumerated = false;
    let disabled = false;
    const r = await applyMpvSubtitleSelection(
      {
        getSubtitleTracks: async () => {
          enumerated = true;
          return [];
        },
        setSubtitleTrack: () => {},
        disableSubtitles: () => {
          disabled = true;
        },
      },
      { subtitleStreams: [], jellyfinSubtitleIndex: -1 },
    );
    expect(r).toEqual({ kind: "disable" });
    expect(disabled).toBe(true);
    expect(enumerated).toBe(false);
  });

  test("burned-in target returns without touching the player", async () => {
    let enumerated = false;
    const r = await applyMpvSubtitleSelection(
      {
        getSubtitleTracks: async () => {
          enumerated = true;
          return [];
        },
        setSubtitleTrack: () => {},
        disableSubtitles: () => {},
      },
      {
        subtitleStreams: [
          emb(2, { DeliveryMethod: Encode, IsTextSubtitleStream: false }),
        ],
        jellyfinSubtitleIndex: 2,
      },
    );
    expect(r).toEqual({ kind: "burnedIn" });
    expect(enumerated).toBe(false);
  });
});

describe("getExternalSubtitleUrl — server contract (MediaInfoHelper)", () => {
  test("server-relative DeliveryUrl gets the basePath prefix", () => {
    expect(
      getExternalSubtitleUrl(ext(0, { DeliveryUrl: "/sub/0.srt" }), {
        offline: false,
        basePath: "http://srv",
      }),
    ).toBe("http://srv/sub/0.srt");
  });

  test("IsExternalUrl means DeliveryUrl is already absolute — no prefix", () => {
    expect(
      getExternalSubtitleUrl(
        ext(0, {
          DeliveryUrl: "https://cdn.example/sub.srt",
          IsExternalUrl: true,
        }),
        { offline: false, basePath: "http://srv" },
      ),
    ).toBe("https://cdn.example/sub.srt");
  });

  test("offline returns the stored local path as-is", () => {
    expect(
      getExternalSubtitleUrl(ext(0, { DeliveryUrl: "file:///subs/0.srt" }), {
        offline: true,
        basePath: "http://srv",
      }),
    ).toBe("file:///subs/0.srt");
  });

  test("no DeliveryUrl or no basePath online → undefined", () => {
    expect(
      getExternalSubtitleUrl(sub({ Index: 0, IsExternal: true }), {
        offline: false,
        basePath: "http://srv",
      }),
    ).toBeUndefined();
    expect(
      getExternalSubtitleUrl(ext(0), { offline: false, basePath: undefined }),
    ).toBeUndefined();
  });
});

describe("resolveSubtitleTrack — language tag variants (ISO 639-1 / 639-2 B-T / IETF)", () => {
  test("Jellyfin 639-2/B matches mpv 639-2/T and 639-1 tags", () => {
    // Server says "ger" (639-2/B); muxers can surface "deu" (/T) or "de" (639-1).
    const streams = [emb(0, { Language: "ger" }), emb(1, { Language: "fre" })];
    const playerT = [
      track({ id: 1, language: "deu" }),
      track({ id: 2, language: "fra" }),
    ];
    expect(resolve(streams, 0, playerT)).toEqual({
      kind: "select",
      trackId: 1,
    });
    expect(resolve(streams, 1, playerT)).toEqual({
      kind: "select",
      trackId: 2,
    });

    const player1 = [
      track({ id: 1, language: "de" }),
      track({ id: 2, language: "fr" }),
    ];
    expect(resolve(streams, 0, player1)).toEqual({
      kind: "select",
      trackId: 1,
    });
  });

  test("IETF tags reduce to their primary subtag", () => {
    const streams = [emb(0, { Language: "eng" }), emb(1, { Language: "spa" })];
    const player = [
      track({ id: 1, language: "en-US" }),
      track({ id: 2, language: "es-419" }),
    ];
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 1 });
    expect(resolve(streams, 1, player)).toEqual({ kind: "select", trackId: 2 });
  });

  test("different languages still never match ('ger' vs 'gre')", () => {
    const streams = [emb(0, { Language: "ger" })];
    const player = [
      track({ id: 1, language: "gre" }),
      track({ id: 2, language: "ger" }),
    ];
    expect(resolve(streams, 0, player)).toEqual({ kind: "select", trackId: 2 });
  });
});

describe("compareTracksForMenu — stable order across play methods (8 Mile live find)", () => {
  test("transcode re-delivery (SRT→External, PGS→Encode) must not reshuffle the menu", () => {
    // In-file order: srt(1) srt(2) pgs(3) pgs(4), plus a real sidecar ext(0).
    const directPlay = [
      ext(0, { Language: "eng" }),
      emb(1, { Language: "fre" }),
      emb(2, { Language: "eng" }),
      emb(3, { Language: "fre", IsTextSubtitleStream: false }),
      emb(4, { Language: "eng", IsTextSubtitleStream: false }),
    ];
    // Same file while transcoding: server re-delivers embedded text as External
    // (extracted) and burns image subs (Encode). IsExternal stays a FILE property.
    const transcoding = [
      ext(0, { Language: "eng" }),
      emb(1, { Language: "fre", DeliveryMethod: External, DeliveryUrl: "/x1" }),
      emb(2, { Language: "eng", DeliveryMethod: External, DeliveryUrl: "/x2" }),
      emb(3, {
        Language: "fre",
        IsTextSubtitleStream: false,
        DeliveryMethod: Encode,
      }),
      emb(4, {
        Language: "eng",
        IsTextSubtitleStream: false,
        DeliveryMethod: Encode,
      }),
    ];
    const order = (streams: MediaStream[]) =>
      [...streams].sort(compareTracksForMenu).map((s) => s.Index);
    expect(order(directPlay)).toEqual([1, 2, 3, 4, 0]);
    expect(order(transcoding)).toEqual(order(directPlay));
  });
});

// --- automatic selection while muted ---------------------------------------

describe("requiresStreamRestart", () => {
  test("burned-in subtitles always require a restart", () => {
    expect(
      requiresStreamRestart(sub({ Index: 0, DeliveryMethod: Encode }), {
        isTranscoding: false,
      }),
    ).toBe(true);
  });

  test("image-based subtitles require a restart only while transcoding", () => {
    const pgs = emb(0, { IsTextSubtitleStream: false });
    expect(requiresStreamRestart(pgs, { isTranscoding: true })).toBe(true);
    expect(requiresStreamRestart(pgs, { isTranscoding: false })).toBe(false);
  });

  test("text subtitles never require a restart", () => {
    expect(requiresStreamRestart(emb(0), { isTranscoding: true })).toBe(false);
  });
});

describe("pickAutoSubtitleTrack", () => {
  const base = { isTranscoding: false, allowStreamRestart: false };

  test("prefers the user's subtitle language over everything else", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          emb(0, { Language: "eng" }),
          emb(1, { Language: "fra" }),
        ],
        preferredLanguage: "fre",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: 1, reason: null });
  });

  test("falls back to a track matching the audio language", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          emb(0, { Language: "spa" }),
          emb(1, { Language: "eng" }),
        ],
        preferredLanguage: "fra",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: 1, reason: null });
  });

  test("falls back to the first non-forced track", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          emb(0, { Language: "spa", IsForced: true }),
          emb(1, { Language: "spa" }),
        ],
        preferredLanguage: "fra",
        audioLanguage: "jpn",
      }),
    ).toMatchObject({ index: 1, reason: null });
  });

  test("never picks a forced track for a language match", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          emb(0, { Language: "fra", IsForced: true }),
          emb(1, { Language: "eng" }),
        ],
        preferredLanguage: "fre",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: 1, reason: null });
  });

  test("uses a forced track when nothing else exists", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [emb(3, { Language: "spa", IsForced: true })],
        preferredLanguage: "fra",
        audioLanguage: "jpn",
      }),
    ).toMatchObject({ index: 3, reason: null });
  });

  test("reports none when the media has no subtitle stream", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [],
        preferredLanguage: "fra",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: null, reason: "none" });
  });

  test("reports restart-required when every track needs a re-process", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        isTranscoding: true,
        subtitleStreams: [emb(0, { IsTextSubtitleStream: false })],
        preferredLanguage: "eng",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: null, reason: "restart-required" });
  });

  test("accepts a restart-requiring track when the caller allows it", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        isTranscoding: true,
        allowStreamRestart: true,
        subtitleStreams: [emb(0, { IsTextSubtitleStream: false })],
        preferredLanguage: "eng",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: 0, reason: null });
  });

  test("keeps image-based tracks eligible during direct play", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [emb(2, { IsTextSubtitleStream: false })],
        preferredLanguage: "eng",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: 2, reason: null });
  });

  test("ignores non-subtitle streams handed in by mistake", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          { Index: 0, Type: "Audio", Language: "eng" } as MediaStream,
        ],
        preferredLanguage: "eng",
        audioLanguage: "eng",
      }),
    ).toMatchObject({ index: null, reason: "none" });
  });

  test("returns the identity of the picked track, not just its index", () => {
    expect(
      pickAutoSubtitleTrack({
        ...base,
        subtitleStreams: [
          emb(0, { Language: "eng" }),
          emb(1, { Language: "fra", IsForced: true }),
          emb(2, { Language: "fra" }),
        ],
        preferredLanguage: "fra",
        audioLanguage: "eng",
      }),
    ).toEqual({
      index: 2,
      track: { language: "fra", isForced: false },
      reason: null,
    });
  });
});
