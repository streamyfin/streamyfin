/**
 * The one index space every subtitle surface speaks.
 *
 * A subtitle selection is carried as a plain number everywhere — route params,
 * the JS↔Swift bridge, download records, the native session seed — so the space
 * has to be total: server streams, "off", and client-side sidecars all live in
 * it. This module owns the encoding; nothing else may hand-roll it.
 *
 * Lives in `utils/` rather than beside the player components because
 * `utils/nativePlayer` needs it too, and `utils/` must not import from
 * `components/` — that dependency is why the native config previously carried a
 * second, incompatible sentinel of its own.
 */

/** Jellyfin's own "no subtitles" value; also what PlaybackInfo expects. */
export const SUBTITLES_OFF = -1;

/**
 * Base of the client-side sidecar block (OpenSubtitles downloads that exist only
 * on the live player handle, never in the Jellyfin media source).
 *
 * A *block* rather than a single sentinel because a session can hold more than
 * one downloaded sidecar, and the next-episode carry-over has to know which one
 * was showing. Chosen well below any real `MediaStream.Index` and below -1.
 */
export const LOCAL_SUBTITLE_INDEX_BASE = -100;

/** Encode the k-th client-side sidecar of the current item. */
export const localSubtitleIndex = (position: number): number =>
  LOCAL_SUBTITLE_INDEX_BASE - position;

/** Inverse of {@link localSubtitleIndex}. Only meaningful for local indexes. */
export const localSubtitlePosition = (index: number): number =>
  LOCAL_SUBTITLE_INDEX_BASE - index;

/**
 * True for a client-side sidecar selection.
 *
 * Open-ended (`<=`) so it also recognises the retired -1000 sentinel the native
 * player used to emit, and so the block can grow without touching callers.
 */
export const isLocalSubtitleIndex = (
  index: number | null | undefined,
): index is number =>
  typeof index === "number" && index <= LOCAL_SUBTITLE_INDEX_BASE;

/**
 * Map a client-side selection to what the Jellyfin stream API understands.
 *
 * A sidecar has no server-side identity, so re-negotiating a stream while one is
 * showing must ask for "no subtitles" — passing the sentinel through would have
 * the server either error or silently pick a real stream.
 */
export const toServerSubtitleIndex = (
  index: number | null | undefined,
): number =>
  index == null || isLocalSubtitleIndex(index) ? SUBTITLES_OFF : index;
