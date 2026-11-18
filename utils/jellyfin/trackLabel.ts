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

/** The words a track row's detail line can carry, in the app's language. */
export interface TrackTags {
  forced: string;
  default: string;
  external: string;
}

/** Joins the parts of a detail line. */
const DETAIL_SEPARATOR = " · ";

/** ffmpeg's subtitle codec names, as people know the formats. Others are shown upper-cased. */
const SUBTITLE_FORMAT_NAMES: Record<string, string> = {
  subrip: "SRT",
  pgssub: "PGS",
  hdmv_pgs_subtitle: "PGS",
  dvd_subtitle: "VOBSUB",
  dvdsub: "VOBSUB",
  webvtt: "VTT",
};

const upperCodec = (stream: MediaStream): string | undefined =>
  stream.Codec ? stream.Codec.toUpperCase() : undefined;

// DTS's profile tells the variant ("DTS-HD MA"), the codec alone says "DTS" for all of them.
const audioCodecName = (stream: MediaStream): string | undefined =>
  stream.Codec?.toLowerCase() === "dts" && stream.Profile
    ? stream.Profile
    : upperCodec(stream);

// ffmpeg writes "5.1(side)" or "stereo"; the variant in parentheses means nothing to a viewer.
const channelsName = (stream: MediaStream): string | undefined => {
  const layout = stream.ChannelLayout?.replace(/\(.*\)$/, "").trim();
  if (layout) return layout.charAt(0).toUpperCase() + layout.slice(1);
  return stream.Channels ? `${stream.Channels} ch` : undefined;
};

/**
 * A track's row in the player menus: the language the server resolved (Jellyfin 12), else the server's own title,
 * else the raw language code, else the index. Only a language label gets a detail line, since the server's title
 * already names the format and the flags.
 */
export const trackMenuText = (
  stream: Jellyfin12MediaStream,
  tags: TrackTags,
): { label: string; detail?: string } => {
  const language = stream.LocalizedLanguage;
  if (!language) {
    return {
      label: stream.DisplayTitle || stream.Language || `#${stream.Index}`,
    };
  }

  const title =
    stream.Title && stream.Title.toLowerCase() !== language.toLowerCase()
      ? stream.Title
      : undefined;
  const parts =
    stream.Type === "Subtitle"
      ? [
          title,
          stream.Codec
            ? (SUBTITLE_FORMAT_NAMES[stream.Codec.toLowerCase()] ??
              upperCodec(stream))
            : undefined,
          stream.IsForced ? tags.forced : undefined,
          stream.IsDefault ? tags.default : undefined,
          stream.IsExternal ? tags.external : undefined,
        ]
      : [title, audioCodecName(stream), channelsName(stream)];
  const detail = parts.filter(Boolean).join(DETAIL_SEPARATOR);
  return detail ? { label: language, detail } : { label: language };
};
