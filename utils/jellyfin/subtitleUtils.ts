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

/** Check if subtitle is image-based (PGS, VOBSUB, etc.) */
export const isImageBasedSubtitle = (sub: MediaStream): boolean =>
  sub.IsTextSubtitleStream === false;

/** A Jellyfin subtitle stream is "external" when the server delivers it as a sidecar file. */
export const isExternalSubtitle = (sub: MediaStream): boolean =>
  sub.DeliveryMethod === EXTERNAL_DELIVERY ||
  sub.IsExternal === true ||
  Boolean(sub.DeliveryUrl);

/**
 * Order subtitle/audio MediaStreams for the selection menu exactly like
 * jellyfin-web's `itemHelper.sortTracks`: in-container tracks first then
 * external, and within each group forced first, then default, then `Index`
 * ascending. Callers prepend their own "None/Off" entry separately.
 *
 * The Jellyfin server inserts external (sidecar) streams at the FRONT of
 * `MediaStreams` (low indices), so raw Index order shows externals first — this
 * comparator flips that to match web (externals last).
 */
export const compareTracksForMenu = (a: MediaStream, b: MediaStream): number =>
  Number(a.IsExternal ?? false) - Number(b.IsExternal ?? false) ||
  Number(b.IsForced ?? false) - Number(a.IsForced ?? false) ||
  Number(b.IsDefault ?? false) - Number(a.IsDefault ?? false) ||
  (a.Index ?? 0) - (b.Index ?? 0);

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

/** Match an embedded player track to a Jellyfin stream by language/title (codec-agnostic). */
const embeddedIdentityMatches = (
  track: PlayerSubtitleTrack,
  stream: MediaStream,
): boolean => {
  if (eq(track.language, stream.Language)) {
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

  // Embedded / in-container subtitle.
  const embeddedStreams = subtitleStreams.filter((s) => !isExternalSubtitle(s));
  const playerEmbedded = playerTracks.filter((t) => t.external !== true);

  // 1) Identity by language/title (unique match wins).
  const identityMatches = playerEmbedded.filter((t) =>
    embeddedIdentityMatches(t, target),
  );
  if (identityMatches.length === 1) {
    return { kind: "select", trackId: identityMatches[0].id };
  }

  // 2) Fallback: embedded order is container order on both sides → ordinal.
  const ordinal = embeddedStreams.findIndex(
    (s) => s.Index === jellyfinSubtitleIndex,
  );
  if (identityMatches.length > 1 && ordinal >= 0) {
    // Multiple same-language tracks: pick by position among the matches.
    const idx = Math.min(ordinal, identityMatches.length - 1);
    return { kind: "select", trackId: identityMatches[idx].id };
  }
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
