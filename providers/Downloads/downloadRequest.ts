import type {
  MediaSourceInfo,
  MediaStream,
  MediaStreamType,
} from "@jellyfin/sdk/lib/generated-client/models";
import { BITRATES, type Bitrate } from "@/components/BitrateSelector";
import {
  DOWNLOAD_VIDEO_CODEC_NAMES,
  type DownloadMode,
  type DownloadVideoCodec,
} from "@/constants/Downloads";
import type { Settings } from "@/utils/atoms/settings";
import {
  compareTracksForMenu,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import type { AudioTranscodeModeType } from "@/utils/profiles/native";
import { SUBTITLES_OFF } from "@/utils/subtitles/subtitleIndex";

/**
 * Whether a download the user confirmed has to be turned down for want of a
 * media source.
 *
 * A single item downloads the source picked in the sheet, and the server only
 * lists sources for what it can play: a video (a missing episode included, as
 * a placeholder), a song, a live channel. A folder, a photo or a book has none
 * and gets a download button on the item page all the same. The user gets
 * there by pressing download, so it is theirs to be told about and not an
 * error of the app's to report. Several items each resolve their own default
 * source once the download starts, so nothing is asked of them up front.
 */
export const lacksMediaSource = (
  pendingCount: number,
  mediaSource: MediaSourceInfo | null | undefined,
): boolean => pendingCount === 1 && !mediaSource?.Id;

export type DownloadChoices = {
  mode: DownloadMode;
  bitrate: Bitrate;
  videoCodec: DownloadVideoCodec;
  audioMode: AudioTranscodeModeType;
};

export const videoCodecLabel = (
  codec: DownloadVideoCodec,
  t: (key: string) => string,
): string =>
  codec === "auto"
    ? t("item_card.download.video_codec_auto")
    : DOWNLOAD_VIDEO_CODEC_NAMES[codec];

/** What the download sheet starts on, from the download defaults in settings. */
export const downloadDefaults = (
  settings: Settings | null | undefined,
): DownloadChoices => ({
  mode: settings?.downloadMode ?? "original",
  bitrate: settings?.defaultDownloadBitrate ?? BITRATES[0],
  videoCodec: settings?.downloadVideoCodec ?? "auto",
  audioMode:
    settings?.downloadAudioTranscodeMode ??
    settings?.audioTranscodeMode ??
    "auto",
});

const streamCount = (
  mediaSource: MediaSourceInfo | null | undefined,
  type: MediaStreamType,
): number =>
  mediaSource?.MediaStreams?.filter((stream) => stream.Type === type).length ??
  0;

/** A transcode keeps one audio track, so there is one to pick. */
export const offersAudioChoice = (
  mediaSource: MediaSourceInfo | null | undefined,
): boolean => streamCount(mediaSource, "Audio") > 1;

/** The subtitles a transcode can burn in, in the order the player lists them. */
export const subtitleStreams = (
  mediaSource: MediaSourceInfo | null | undefined,
): (MediaStream & { Index: number })[] =>
  (mediaSource?.MediaStreams ?? [])
    .filter(
      (stream): stream is MediaStream & { Index: number } =>
        stream.Type === "Subtitle" && typeof stream.Index === "number",
    )
    .sort(compareTracksForMenu);

const findSubtitle = (
  mediaSource: MediaSourceInfo | null | undefined,
  index: number | null | undefined,
) =>
  mediaSource?.MediaStreams?.find(
    (stream) => stream.Type === "Subtitle" && stream.Index === index,
  );

/** A preferred image subtitle is burned in by default: a transcode would lose it. */
export const defaultBurnIn = (
  mediaSource: MediaSourceInfo | null | undefined,
  preferredIndex: number | null | undefined,
): number => {
  const preferred = findSubtitle(mediaSource, preferredIndex);
  return preferred && isImageBasedSubtitle(preferred) && preferredIndex != null
    ? preferredIndex
    : SUBTITLES_OFF;
};

/** A transcode burns in any subtitle it is asked for, so it only gets the burn-in. */
export const downloadSubtitleIndexes = ({
  mode,
  mediaSource,
  preferredIndex,
  burnInIndex,
}: {
  mode: DownloadMode;
  mediaSource: MediaSourceInfo | null | undefined;
  preferredIndex: number;
  burnInIndex: number;
}): { requested: number; playedOffline: number } => {
  if (mode === "original") {
    return { requested: preferredIndex, playedOffline: preferredIndex };
  }
  if (burnInIndex !== SUBTITLES_OFF) {
    return { requested: burnInIndex, playedOffline: burnInIndex };
  }
  const preferred = findSubtitle(mediaSource, preferredIndex);
  return {
    requested: SUBTITLES_OFF,
    playedOffline:
      preferred && !isImageBasedSubtitle(preferred)
        ? preferredIndex
        : SUBTITLES_OFF,
  };
};

/** A transcode's output holds one video and one audio track of the source's. */
export const transcodeLosesTracks = (
  mediaSource: MediaSourceInfo | null | undefined,
): boolean =>
  streamCount(mediaSource, "Video") > 1 || offersAudioChoice(mediaSource);
