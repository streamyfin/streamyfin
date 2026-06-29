import { describe, expect, test } from "bun:test";
import type {
  MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";
import {
  compareTracksForMenu,
  isExternalSubtitle,
  type PlayerSubtitleTrack,
  resolveSubtitleTrack,
} from "@/utils/jellyfin/subtitleUtils";

// String-enum values as typed literals — avoids a runtime SDK import (see subtitleUtils.ts).
const External = "External" as SubtitleDeliveryMethod;
const Embed = "Embed" as SubtitleDeliveryMethod;

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
