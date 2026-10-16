import type { MediaStream } from "@jellyfin/sdk/lib/generated-client";

/**
 * `MediaStream` with the fields Jellyfin 12 added (jellyfin/jellyfin#12579,
 * #16829). The generated client predates them, and an older server simply does
 * not send them, so their absence is the version gate.
 */
export type Jellyfin12MediaStream = MediaStream & {
  /** The audio track in the item's original language. */
  IsOriginal?: boolean | null;
  /** `Language` as a display name, in the server's language. */
  LocalizedLanguage?: string | null;
  /** The word the server appends to `DisplayTitle` for an original track. */
  LocalizedOriginal?: string | null;
};

/** What the server writes when it has no translation of its own. */
const SERVER_ORIGINAL_FALLBACK = "Original";

/** Same separator the server joins `DisplayTitle` with, so a tag of ours reads like one of its own. */
const TAG_SEPARATOR = " - ";

/**
 * The stream's language for display: the server-resolved name on Jellyfin 12,
 * the raw ISO code before that.
 */
export const streamLanguageName = (
  stream: Jellyfin12MediaStream,
): string | undefined =>
  stream.LocalizedLanguage || stream.Language || undefined;

// toLowerCase, not toLocaleLowerCase: a Turkish device lowercases "I" to a
// dotless "ı", and "ORIGINAL" would stop matching "Original".
const mentions = (label: string, word: string | null | undefined): boolean =>
  !!word && label.toLowerCase().includes(word.toLowerCase());

/**
 * Marks the original-language audio track in a picker label.
 *
 * Jellyfin 12 already appends the word to `DisplayTitle`, in the server's
 * language, and skips it when the track's own title contains it. The check
 * below is the same substring test, against every spelling that can be in the
 * label, so a track is never tagged twice.
 */
export const tagOriginalAudioTrack = (
  label: string,
  stream: Jellyfin12MediaStream,
  originalLabel: string,
): string => {
  // An empty tag (a catalogue with a blank entry) would leave a bare separator.
  if (stream.IsOriginal !== true || !originalLabel) return label;

  const alreadyTagged = [
    originalLabel,
    stream.LocalizedOriginal,
    SERVER_ORIGINAL_FALLBACK,
  ].some((word) => mentions(label, word));
  if (alreadyTagged) return label;

  return label ? `${label}${TAG_SEPARATOR}${originalLabel}` : originalLabel;
};
