/**
 * Subtitle utilities: resolve a Jellyfin subtitle stream to the right track in
 * the *player's real track list* by identity — never by positional counting.
 *
 * Why: Jellyfin renumbers MediaStreams (externals first); the player enumerates
 * embedded-from-container first and externals (`sub-add`) last; and a library that
 * hides embedded subs drops them from MediaStreams while the player still demuxes
 * them from the file. Positional Index→id mapping therefore mis-selects (e.g.
 * picking Spanish shows English). See {@link resolveSubtitleTrack}.
 *
 * Image-based subtitles (PGS, VOBSUB) during transcoding are burned into the video
 * and absent from the player's track list.
 */

import type {
  MediaSourceInfo,
  MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";

// "External" is the value of SubtitleDeliveryMethod.External. Compared as a typed
// literal so this util needs no *runtime* import of the SDK barrel — which pulls in
// the axios-dependent `/api` modules and breaks unit tests under `bun test`.
const EXTERNAL_DELIVERY = "External" as SubtitleDeliveryMethod;
const ENCODE_DELIVERY = "Encode" as SubtitleDeliveryMethod;

/** Check if subtitle is image-based (PGS, VOBSUB, etc.) */
export const isImageBasedSubtitle = (sub: MediaStream): boolean =>
  sub.IsTextSubtitleStream === false;

/**
 * Burned into the video by the server (`DeliveryMethod === Encode`, e.g. image
 * subs while transcoding, or sidecar formats no profile can deliver). Never a
 * selectable player track — switching to/away requires a stream refresh.
 */
export const isBurnedInSubtitle = (sub: MediaStream): boolean =>
  sub.DeliveryMethod === ENCODE_DELIVERY;

/**
 * A Jellyfin subtitle stream is "external" when the server delivers it as a
 * sub-added sidecar — i.e. `DeliveryMethod === External` (or the `IsExternal`
 * flag before a device-specific delivery method is assigned).
 *
 * Deliberately NOT keyed on `DeliveryUrl`: an Hls-delivered sub also carries a
 * `DeliveryUrl` but lives inside the player's track list (not `sub-add`-ed), so
 * it must resolve through the embedded path. Keeping this in lockstep with the
 * load sites (which only `sub-add` `DeliveryMethod === External`) and with the
 * menu comparator below avoids a sub being sorted as embedded yet resolved as
 * external (→ `notFound`).
 */
export const isExternalSubtitle = (sub: MediaStream): boolean =>
  sub.DeliveryMethod === EXTERNAL_DELIVERY ||
  (sub.DeliveryMethod == null && sub.IsExternal === true);

/**
 * The exact URL/path an external sub is (or would be) loaded into the player
 * with. Single source of truth for BOTH the load site (`videoSource`
 * externalSubtitles) and identity matching (`getExpectedExternalUrl`) — the
 * filename match only works while the two stay byte-identical.
 *
 * Server contract (MediaInfoHelper.SetDeviceSpecificSubtitleInfo): DeliveryUrl
 * is server-relative (`/Videos/...`, may carry `?ApiKey=`) UNLESS
 * `IsExternalUrl` is set — then it is already an absolute URL and must not be
 * prefixed. Offline: DeliveryUrl holds the local file path.
 */
export const getExternalSubtitleUrl = (
  sub: MediaStream,
  opts: { offline: boolean; basePath?: string | null },
): string | undefined => {
  if (!sub.DeliveryUrl) return undefined;
  if (opts.offline || sub.IsExternalUrl) return sub.DeliveryUrl;
  return opts.basePath ? `${opts.basePath}${sub.DeliveryUrl}` : undefined;
};

/**
 * Order subtitle MediaStreams for the selection menu exactly like jellyfin-web's
 * `itemHelper.sortTracks`: in-container tracks first then external, and within
 * each group forced first, then default, then `Index` ascending. Callers prepend
 * their own "None/Off" entry separately.
 *
 * The Jellyfin server inserts external (sidecar) streams at the FRONT of
 * `MediaStreams` (low indices), so raw Index order shows externals first — this
 * comparator flips that to match web (externals last). Uses the raw `IsExternal`
 * flag exactly like web's `sortTracks` (itemHelper.js): it is a property of the
 * FILE, so the menu order stays identical between direct play and transcode —
 * delivery-based grouping would reshuffle entries when the server re-delivers
 * extracted text subs as External and burns image subs (Encode). Ordering is
 * purely cosmetic; selection resolves by `Index` identity regardless.
 */
export const compareTracksForMenu = (a: MediaStream, b: MediaStream): number =>
  Number(a.IsExternal ?? false) - Number(b.IsExternal ?? false) ||
  Number(b.IsForced ?? false) - Number(a.IsForced ?? false) ||
  Number(b.IsDefault ?? false) - Number(a.IsDefault ?? false) ||
  // Missing Index sorts to the end (not 0, which would float it to the top and
  // collide with a real Index 0).
  (a.Index ?? Number.MAX_SAFE_INTEGER) - (b.Index ?? Number.MAX_SAFE_INTEGER);

/**
 * Identity of a subtitle track as reported by the *player's real track list*
 * (mpv `track-list`, or a Cast media-track list). Player-agnostic on purpose so
 * the same resolver can drive the mpv player today and the Chromecast backend later.
 */
export type PlayerSubtitleTrack = {
  /** Player-side id used to actually select the track (mpv `sid`, cast trackId). */
  id: number;
  /** True if loaded from a separate file (mpv `external`). */
  external?: boolean;
  /** For external tracks: the exact URL/path it was loaded from (mpv `external-filename`). */
  externalFilename?: string;
  language?: string;
  title?: string;
  codec?: string;
};

export type SubtitleSelection =
  | { kind: "select"; trackId: number }
  | { kind: "disable" }
  /** Target is server-burned (Encode) — only a stream refresh can show/hide it. */
  | { kind: "burnedIn" }
  | { kind: "notFound" };

/** Decode percent-encoding and strip a leading `file://` scheme for tolerant comparison. */
const normalizeUrl = (url: string): string => {
  let u = url;
  try {
    u = decodeURIComponent(u);
  } catch {
    // not decodable — compare raw
  }
  return u.replace(/^file:\/\//, "");
};

const externalFilenameMatches = (
  trackFilename: string | undefined,
  expectedUrl: string | undefined,
): boolean => {
  if (!trackFilename || !expectedUrl) return false;
  const a = normalizeUrl(trackFilename);
  const b = normalizeUrl(expectedUrl);
  return a === b || a.endsWith(b) || b.endsWith(a);
};

const eq = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * ISO 639-1 (2-letter) and ISO 639-2/T tags mapped to their ISO 639-2/B form,
 * so tags from different muxers/servers compare equal ("de"/"deu"/"ger" → "ger").
 * Jellyfin normalizes probe results to 639-2/B, but mkv `LanguageIETF` tags
 * ("en-US") and some muxers' 639-1 or /T tags leak through to mpv's `lang`.
 */
const LANG_CANONICAL: Record<string, string> = {
  // ISO 639-1 → 639-2/B
  aa: "aar",
  ab: "abk",
  ae: "ave",
  af: "afr",
  ak: "aka",
  am: "amh",
  an: "arg",
  ar: "ara",
  as: "asm",
  av: "ava",
  ay: "aym",
  az: "aze",
  ba: "bak",
  be: "bel",
  bg: "bul",
  bh: "bih",
  bi: "bis",
  bm: "bam",
  bn: "ben",
  bo: "tib",
  br: "bre",
  bs: "bos",
  ca: "cat",
  ce: "che",
  ch: "cha",
  co: "cos",
  cr: "cre",
  cs: "cze",
  cu: "chu",
  cv: "chv",
  cy: "wel",
  da: "dan",
  de: "ger",
  dv: "div",
  dz: "dzo",
  ee: "ewe",
  el: "gre",
  en: "eng",
  eo: "epo",
  es: "spa",
  et: "est",
  eu: "baq",
  fa: "per",
  ff: "ful",
  fi: "fin",
  fj: "fij",
  fo: "fao",
  fr: "fre",
  fy: "fry",
  ga: "gle",
  gd: "gla",
  gl: "glg",
  gn: "grn",
  gu: "guj",
  gv: "glv",
  ha: "hau",
  he: "heb",
  hi: "hin",
  ho: "hmo",
  hr: "hrv",
  ht: "hat",
  hu: "hun",
  hy: "arm",
  hz: "her",
  ia: "ina",
  id: "ind",
  ie: "ile",
  ig: "ibo",
  ii: "iii",
  ik: "ipk",
  io: "ido",
  is: "ice",
  it: "ita",
  iu: "iku",
  ja: "jpn",
  jv: "jav",
  ka: "geo",
  kg: "kon",
  ki: "kik",
  kj: "kua",
  kk: "kaz",
  kl: "kal",
  km: "khm",
  kn: "kan",
  ko: "kor",
  kr: "kau",
  ks: "kas",
  ku: "kur",
  kv: "kom",
  kw: "cor",
  ky: "kir",
  la: "lat",
  lb: "ltz",
  lg: "lug",
  li: "lim",
  ln: "lin",
  lo: "lao",
  lt: "lit",
  lu: "lub",
  lv: "lav",
  mg: "mlg",
  mh: "mah",
  mi: "mao",
  mk: "mac",
  ml: "mal",
  mn: "mon",
  mr: "mar",
  ms: "may",
  mt: "mlt",
  my: "bur",
  na: "nau",
  nb: "nob",
  nd: "nde",
  ne: "nep",
  ng: "ndo",
  nl: "dut",
  nn: "nno",
  no: "nor",
  nr: "nbl",
  nv: "nav",
  ny: "nya",
  oc: "oci",
  oj: "oji",
  om: "orm",
  or: "ori",
  os: "oss",
  pa: "pan",
  pi: "pli",
  pl: "pol",
  ps: "pus",
  pt: "por",
  qu: "que",
  rm: "roh",
  rn: "run",
  ro: "rum",
  ru: "rus",
  rw: "kin",
  sa: "san",
  sc: "srd",
  sd: "snd",
  se: "sme",
  sg: "sag",
  si: "sin",
  sk: "slo",
  sl: "slv",
  sm: "smo",
  sn: "sna",
  so: "som",
  sq: "alb",
  sr: "srp",
  ss: "ssw",
  st: "sot",
  su: "sun",
  sv: "swe",
  sw: "swa",
  ta: "tam",
  te: "tel",
  tg: "tgk",
  th: "tha",
  ti: "tir",
  tk: "tuk",
  tl: "tgl",
  tn: "tsn",
  to: "ton",
  tr: "tur",
  ts: "tso",
  tt: "tat",
  tw: "twi",
  ty: "tah",
  ug: "uig",
  uk: "ukr",
  ur: "urd",
  uz: "uzb",
  ve: "ven",
  vi: "vie",
  vo: "vol",
  wa: "wln",
  wo: "wol",
  xh: "xho",
  yi: "yid",
  yo: "yor",
  za: "zha",
  zh: "chi",
  zu: "zul",
  // ISO 639-2/T → /B (the 20 languages with two distinct 3-letter codes)
  bod: "tib",
  ces: "cze",
  cym: "wel",
  deu: "ger",
  ell: "gre",
  eus: "baq",
  fas: "per",
  fra: "fre",
  hye: "arm",
  isl: "ice",
  kat: "geo",
  mkd: "mac",
  mri: "mao",
  msa: "may",
  mya: "bur",
  nld: "dut",
  ron: "rum",
  slk: "slo",
  sqi: "alb",
  zho: "chi",
};

/** Canonicalize a language tag: lowercase, primary subtag ("en-US" → "en"), 639-2/B. */
const canonicalLang = (raw: string): string => {
  const primary = raw.trim().toLowerCase().split("-")[0];
  return LANG_CANONICAL[primary] ?? primary;
};

/** Language-tag comparison across ISO 639-1 / 639-2 B/T / IETF variants. */
const langEq = (a?: string | null, b?: string | null): boolean =>
  !!a && !!b && canonicalLang(a) === canonicalLang(b);

/** Match an embedded player track to a Jellyfin stream by language/title (codec-agnostic). */
const embeddedIdentityMatches = (
  track: PlayerSubtitleTrack,
  stream: MediaStream,
): boolean => {
  if (langEq(track.language, stream.Language)) {
    // When both carry a title it must agree; otherwise language alone is enough.
    if (track.title && stream.Title) return eq(track.title, stream.Title);
    return true;
  }
  // No language on one side — fall back to a title match.
  if (!track.language || !stream.Language) return eq(track.title, stream.Title);
  return false;
};

/**
 * Resolve the player track id for a given Jellyfin subtitle index by matching
 * against the player's REAL track list (identity), never by positional counting.
 *
 * Why identity, not position: Jellyfin renumbers `MediaStreams` (externals first)
 * while the player enumerates embedded-from-container first and externals
 * (`sub-add`) last; and when a library hides embedded subs they vanish from
 * `MediaStreams` but still physically exist in the file the player demuxes.
 * Positional Index→id mapping therefore mis-selects (e.g. picking Spanish shows
 * English — issues #954/#1690/#618/#1467/#976/#1451).
 *
 * Strategy:
 *  - disabled (-1/undefined) → `disable`
 *  - external Jellyfin sub → match the player track by `externalFilename`
 *    (exact identity, immune to hidden-embedded shifts); fall back to the
 *    ordinal among *loadable* externals (Swiftfin: externals are the list tail).
 *  - embedded Jellyfin sub → match by language/title among non-external tracks;
 *    fall back to the embedded ordinal (container order aligns on both sides).
 *
 * Player-agnostic: pass any player's track list + a URL builder, so the mpv
 * player and (later) the Chromecast backend share one source of truth.
 */
export const resolveSubtitleTrack = (params: {
  subtitleStreams: MediaStream[] | undefined;
  jellyfinSubtitleIndex: number | undefined;
  playerTracks: PlayerSubtitleTrack[];
  /** Build the exact URL/path an external Jellyfin sub was loaded into the player with. */
  getExpectedExternalUrl?: (sub: MediaStream) => string | undefined;
}): SubtitleSelection => {
  const { jellyfinSubtitleIndex, playerTracks, getExpectedExternalUrl } =
    params;
  const subtitleStreams = params.subtitleStreams ?? [];

  if (jellyfinSubtitleIndex === undefined || jellyfinSubtitleIndex === -1) {
    return { kind: "disable" };
  }

  const target = subtitleStreams.find((s) => s.Index === jellyfinSubtitleIndex);
  if (!target) return { kind: "notFound" };

  // Server-burned subs are pixels, not tracks — signal the caller to refresh
  // the stream instead of hunting for a track that cannot exist.
  if (isBurnedInSubtitle(target)) return { kind: "burnedIn" };

  if (isExternalSubtitle(target)) {
    const playerExternals = playerTracks.filter((t) => t.external === true);

    // 1) Exact identity by external filename — robust against hidden-embedded offset.
    const expectedUrl = getExpectedExternalUrl?.(target);
    const byName = playerExternals.find((t) =>
      externalFilenameMatches(t.externalFilename, expectedUrl),
    );
    if (byName) return { kind: "select", trackId: byName.id };

    // 2) Fallback: externals are appended in MediaStreams order → ordinal among
    //    *loadable* externals (those actually added to the player) stays in lockstep
    //    with the player's external list, skipping ones with no DeliveryUrl (#1763).
    const externalStreams = subtitleStreams.filter(isExternalSubtitle);
    const loadableExternals = getExpectedExternalUrl
      ? externalStreams.filter((s) => getExpectedExternalUrl(s))
      : externalStreams;
    const ordinal = loadableExternals.findIndex(
      (s) => s.Index === jellyfinSubtitleIndex,
    );
    if (ordinal >= 0 && ordinal < playerExternals.length) {
      return { kind: "select", trackId: playerExternals[ordinal].id };
    }
    return { kind: "notFound" };
  }

  // Embedded / in-container subtitle. Burned-in (Encode) streams are excluded:
  // they are baked into the video and never appear in the player's track list,
  // so counting them would shift every ordinal below.
  const embeddedStreams = subtitleStreams.filter(
    (s) => !isExternalSubtitle(s) && !isBurnedInSubtitle(s),
  );
  const playerEmbedded = playerTracks.filter((t) => t.external !== true);

  // 1) Identity by language/title (unique match wins).
  const identityMatches = playerEmbedded.filter((t) =>
    embeddedIdentityMatches(t, target),
  );
  if (identityMatches.length === 1) {
    return { kind: "select", trackId: identityMatches[0].id };
  }

  // 2) Multiple same-identity tracks: ordinal within the same-identity GROUP —
  //    the k-th matching stream corresponds to the k-th matching player track
  //    (container order is preserved on both sides, filter preserves order).
  //    The group ordinal, not the global one: with [jpn, eng, eng] the first
  //    eng is global position 1 but group position 0.
  if (identityMatches.length > 1) {
    const groupStreams = embeddedStreams.filter((s) =>
      identityMatches.some((t) => embeddedIdentityMatches(t, s)),
    );
    const groupOrdinal = groupStreams.findIndex(
      (s) => s.Index === jellyfinSubtitleIndex,
    );
    if (groupOrdinal >= 0) {
      const idx = Math.min(groupOrdinal, identityMatches.length - 1);
      return { kind: "select", trackId: identityMatches[idx].id };
    }
  }

  // 3) Fallback: embedded order is container order on both sides → ordinal.
  const ordinal = embeddedStreams.findIndex(
    (s) => s.Index === jellyfinSubtitleIndex,
  );
  if (ordinal >= 0 && ordinal < playerEmbedded.length) {
    return { kind: "select", trackId: playerEmbedded[ordinal].id };
  }
  return { kind: "notFound" };
};

/**
 * A subtitle track as reported by a concrete player's track-list API
 * (mpv `getSubtitleTracks`, or a Cast track list). `lang` mirrors mpv's field name.
 */
export type PlayerSubtitleTrackRaw = {
  id: number;
  lang?: string;
  title?: string;
  codec?: string;
  external?: boolean;
  externalFilename?: string;
};

/**
 * Minimal player surface needed to select a subtitle. Satisfied structurally by
 * the mpv player ref and (later) implementable by the Chromecast backend.
 */
export interface SubtitleSelectablePlayer {
  getSubtitleTracks: () => Promise<PlayerSubtitleTrackRaw[] | null | undefined>;
  setSubtitleTrack: (trackId: number) => unknown;
  disableSubtitles: () => unknown;
}

/**
 * Read the player's real track list, resolve the Jellyfin subtitle index by
 * identity ({@link resolveSubtitleTrack}) and apply the result. Single entry point
 * for both the mobile controls and the player screen, so selection stays
 * consistent everywhere. Returns the resolution for callers that want to react.
 */
export const applyMpvSubtitleSelection = async (
  player: SubtitleSelectablePlayer | null | undefined,
  params: {
    subtitleStreams: MediaStream[] | undefined;
    jellyfinSubtitleIndex: number;
    /** Build the exact URL/path an external sub was loaded into the player with. */
    getExpectedExternalUrl?: (sub: MediaStream) => string | undefined;
  },
): Promise<SubtitleSelection> => {
  if (!player) return { kind: "notFound" };

  // Called fire-and-forget (`void applyMpvSubtitleSelection(...)`), so any native
  // rejection from getSubtitleTracks/setSubtitleTrack/disableSubtitles must be
  // swallowed here instead of escaping as an unhandled promise rejection.
  try {
    // Short-circuit the outcomes that don't need the player's track list, so
    // the common subtitles-off case skips a full native enumeration.
    if (params.jellyfinSubtitleIndex === -1) {
      await player.disableSubtitles();
      return { kind: "disable" };
    }
    const burnTarget = params.subtitleStreams?.find(
      (s) => s.Index === params.jellyfinSubtitleIndex,
    );
    if (burnTarget && isBurnedInSubtitle(burnTarget)) {
      return { kind: "burnedIn" };
    }

    const tracks = (await player.getSubtitleTracks()) ?? [];
    const selection = resolveSubtitleTrack({
      subtitleStreams: params.subtitleStreams,
      jellyfinSubtitleIndex: params.jellyfinSubtitleIndex,
      playerTracks: tracks.map((t) => ({
        id: t.id,
        external: t.external,
        externalFilename: t.externalFilename,
        language: t.lang,
        title: t.title,
        codec: t.codec,
      })),
      getExpectedExternalUrl: params.getExpectedExternalUrl,
    });

    if (selection.kind === "select") {
      await player.setSubtitleTrack(selection.trackId);
    } else if (selection.kind === "disable") {
      await player.disableSubtitles();
    }
    // notFound → leave current selection (e.g. image subs burned in while transcoding)
    return selection;
  } catch {
    return { kind: "notFound" };
  }
};

/**
 * Calculate the MPV track ID for a given Jellyfin audio index.
 *
 * For direct play: Audio tracks map to their position in the file (1-based).
 * For transcoding: Only ONE audio track exists in the HLS stream (the selected one),
 * so we should return 1 or undefined to use the default track.
 *
 * MPV track IDs are 1-based.
 *
 * @param mediaSource - The media source containing audio streams
 * @param jellyfinAudioIndex - The Jellyfin server-side audio index
 * @param isTranscoding - Whether the stream is being transcoded
 * @returns MPV track ID (1-based), or undefined if not found
 */
export const getMpvAudioId = (
  mediaSource: MediaSourceInfo | null | undefined,
  jellyfinAudioIndex: number | undefined,
  isTranscoding: boolean,
): number | undefined => {
  if (jellyfinAudioIndex === undefined) {
    return undefined;
  }

  // When transcoding, Jellyfin only includes the selected audio track in the HLS stream.
  // So there's only 1 audio track - no need to specify an ID.
  if (isTranscoding) {
    return undefined;
  }

  const allAudio =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];

  // Find position in audio list (1-based for MPV)
  const position = allAudio.findIndex((a) => a.Index === jellyfinAudioIndex);
  return position >= 0 ? position + 1 : undefined;
};

/**
 * True when switching to this subtitle forces the server to re-process the
 * stream, which cuts playback and reseeks.
 *
 * Mirrors the two guards the player already applies, so callers that want to
 * avoid an interruption can filter on the same rule: the burned-in check in
 * {@link applyMpvSubtitleSelection}, and the transcode + image-based check in
 * `direct-player`'s `handleSubtitleIndexChange`. Note that during direct play an
 * image-based track is a real player track and needs no restart at all.
 */
export const requiresStreamRestart = (
  sub: MediaStream,
  opts: { isTranscoding: boolean },
): boolean =>
  isBurnedInSubtitle(sub) || (opts.isTranscoding && isImageBasedSubtitle(sub));

export type AutoSubtitlePick =
  | { index: number; reason: null }
  | { index: null; reason: "restart-required" | "none" };

/**
 * Choose the subtitle to switch on automatically when audio is muted.
 *
 * Preference order: the language the user asked for, then the language of the
 * audio actually playing (so the text matches what would be heard), then any
 * non-forced track, then a forced one. Forced tracks come last on purpose —
 * they only cover foreign-language inserts, which is useless with no sound.
 *
 * Pure and player-agnostic so the Chromecast backend can reuse it unchanged.
 */
export const pickAutoSubtitleTrack = (params: {
  subtitleStreams: MediaStream[];
  preferredLanguage?: string | null;
  audioLanguage?: string | null;
  isTranscoding: boolean;
  allowStreamRestart: boolean;
}): AutoSubtitlePick => {
  const candidates = params.subtitleStreams.filter(
    (s) => s.Type === "Subtitle" && typeof s.Index === "number",
  );
  if (candidates.length === 0) return { index: null, reason: "none" };

  const pool = params.allowStreamRestart
    ? candidates
    : candidates.filter(
        (s) =>
          !requiresStreamRestart(s, { isTranscoding: params.isTranscoding }),
      );
  if (pool.length === 0) return { index: null, reason: "restart-required" };

  const ordered = [...pool].sort(compareTracksForMenu);
  const byLanguage = (lang: string | null | undefined) =>
    ordered.find((s) => !s.IsForced && langEq(s.Language, lang));

  const picked =
    byLanguage(params.preferredLanguage) ??
    byLanguage(params.audioLanguage) ??
    ordered.find((s) => !s.IsForced) ??
    ordered[0];

  return { index: picked.Index as number, reason: null };
};
