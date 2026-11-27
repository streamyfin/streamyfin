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

/** ISO 639 codes the server leaves out of `DisplayTitle`: uncoded, multiple, undetermined, none. */
const UNSHOWN_LANGUAGE_CODES = new Set(["mis", "mul", "und", "zxx"]);

const isWordCharacter = (character: string | undefined): boolean =>
  !!character && /^[\p{L}\p{N}]$/u.test(character);

/** The word at `index` in `label`, not the middle of a longer one ("eng" is not in "Engine"). */
const isWholeWordAt = (label: string, index: number, length: number) =>
  !isWordCharacter(label.charAt(index - 1)) &&
  !isWordCharacter(label.charAt(index + length));

const startsWithWord = (label: string, word: string): boolean =>
  label.toLowerCase().startsWith(word.toLowerCase()) &&
  isWholeWordAt(label, 0, word.length);

const containsWord = (label: string, word: string): boolean => {
  const haystack = label.toLowerCase();
  const needle = word.toLowerCase();
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + 1)
  ) {
    if (isWholeWordAt(haystack, at, needle.length)) return true;
  }
  return false;
};

/**
 * Whether the server left the language out of the attributes because the title
 * already held it. It tests `Title.Contains(name)`, with the name it resolved
 * itself ("French"). Jellyfin 12 sends that name, so the same substring test
 * answers. Before 12 only the code ("fra") is known, which cannot be found in
 * "French", so it counts only as a whole word: a title that spells the name
 * out stays undetected, and the language is not repeated in front of it.
 */
const titleHoldsLanguage = (
  title: string,
  stream: Jellyfin12MediaStream,
  language: string,
): boolean =>
  stream.LocalizedLanguage
    ? mentions(title, stream.LocalizedLanguage)
    : containsWord(title, language);

/**
 * `DisplayTitle` of an audio stream, with its language first.
 *
 * The server writes the track title first and appends the attributes the
 * title does not already contain. Releases often use the file name as the
 * title, which fills the native iOS menu before the language appears. So the
 * attributes move in front of the title, and the language goes first when the
 * title already contained it. A `DisplayTitle` in any other shape stays as it
 * is, because cutting a string of unknown structure can split it anywhere.
 */
export const audioDisplayTitle = (
  stream: Jellyfin12MediaStream,
): string | undefined => {
  const { DisplayTitle: displayTitle, Title: title } = stream;
  if (!displayTitle) return undefined;
  if (!title || !displayTitle.startsWith(title)) return displayTitle;

  const rest = displayTitle.slice(title.length);
  if (rest && !rest.startsWith(TAG_SEPARATOR)) return displayTitle;

  const attributes = rest.slice(TAG_SEPARATOR.length);
  const label = attributes ? `${attributes}${TAG_SEPARATOR}${title}` : title;

  const language = streamLanguageName(stream);
  const showsLanguage =
    !!language &&
    !UNSHOWN_LANGUAGE_CODES.has(stream.Language?.toLowerCase() ?? "");
  if (!showsLanguage) return label;
  // The server puts the language first among the attributes, unless the title
  // held it. Comparing the label with `language` instead fails before
  // Jellyfin 12: the label says "French", the stream only "fra".
  const languageIsFirst = attributes
    ? !titleHoldsLanguage(title, stream, language)
    : startsWithWord(label, language);
  if (languageIsFirst) return label;
  // Upper-case the first letter like the server does, so a raw ISO code from
  // a server without resolved names reads "Ger", as it would in its own label.
  const shown = language.charAt(0).toUpperCase() + language.slice(1);
  return `${shown}${TAG_SEPARATOR}${label}`;
};

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
