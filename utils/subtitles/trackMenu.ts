/**
 * One builder for every audio/subtitle menu in the app.
 *
 * Five surfaces used to filter, sort and label streams themselves — both item
 * pages, both JS player menus and the native player's bridge config — and they
 * disagreed in ways that were individually small and collectively the source of
 * most of this subsystem's bugs. The rows below are deliberately neutral: no
 * callbacks, no player handles, no React. Each surface renders them and attaches
 * its own selection behaviour.
 */
import type { MediaStream } from "@jellyfin/sdk/lib/generated-client";
import {
  compareTracksForMenu,
  isBurnedInSubtitle,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import { localSubtitleIndex, SUBTITLES_OFF } from "./subtitleIndex";

export type TrackRowKind =
  /** "No subtitles" — Jellyfin index -1. */
  | "off"
  /** A stream in the Jellyfin media source. */
  | "server"
  /** A client-side downloaded file that exists only on the player handle. */
  | "sidecar"
  /** Pixels in the video, not a track. Inert: it can only be shown or hidden by re-processing the stream. */
  | "burnedIn";

export interface TrackMenuRow {
  /** Identity in the unified index space (see subtitleIndex.ts). */
  index: number;
  label: string;
  selected: boolean;
  kind: TrackRowKind;
  /**
   * ISO code of the stream this row was built from, carried so a per-series
   * memory write never has to re-derive it from a stream list that may have
   * been refetched since the menu was built.
   */
  language?: string;
  /**
   * Selecting this row needs the server to re-process the stream rather than a
   * cheap in-player track switch.
   */
  requiresReload: boolean;
  /** `kind: "sidecar"` only — the local file to load into the player. */
  localPath?: string;
}

export interface LocalSubtitleFile {
  name: string;
  filePath: string;
}

const defaultLabel = (stream: MediaStream): string =>
  stream.DisplayTitle || stream.Language || `Track ${stream.Index}`;

/**
 * Under transcoding these are burned into the video by the server. Both
 * switching *to* one and switching *away from* an active one need a re-process,
 * so the rule is a function of (current, target) — not of the target alone.
 *
 * Tests both predicates: `isImageBasedSubtitle` (PGS/VOBSUB) and
 * `isBurnedInSubtitle` (DeliveryMethod Encode, which also catches a *text*
 * format no profile could deliver). The menus previously checked only the
 * first while the resolver checked only the second, so a text sub the server
 * chose to Encode was offered as a cheap switch and silently failed.
 */
const needsReprocessing = (stream: MediaStream | undefined): boolean =>
  !!stream && (isImageBasedSubtitle(stream) || isBurnedInSubtitle(stream));

export interface SubtitleMenuOptions {
  /** Currently selected index in the unified space. */
  selectedIndex: number;
  /** Localized label for the "no subtitles" row. */
  offLabel: string;
  isTranscoding: boolean;
  /** Client-side downloads, listed after the server tracks. */
  localSubs?: LocalSubtitleFile[];
  /**
   * Offline transcoded download: the file carries a subset of streams, and any
   * image subtitle chosen at download time was burned into the video.
   */
  offlineTranscoded?: { burnedInIndex?: number };
  /** Override the default label format (DisplayTitle → Language → "Track N"). */
  formatLabel?: (stream: MediaStream) => string;
  /** Suffix for the inert burned-in row on a transcoded download. */
  burnedInSuffix?: string;
}

export const buildSubtitleMenu = (
  streams: MediaStream[] | null | undefined,
  options: SubtitleMenuOptions,
): TrackMenuRow[] => {
  const {
    selectedIndex,
    offLabel,
    isTranscoding,
    localSubs,
    offlineTranscoded,
    formatLabel = defaultLabel,
    burnedInSuffix = "(burned in)",
  } = options;

  // A stream with no Index cannot be selected or remembered. Dropping it is the
  // point: `?? -1` aliased it onto the "subtitles off" sentinel, which then
  // persisted "off" as the series preference for a track the user had picked.
  const subtitleStreams = (streams ?? []).filter(
    (s): s is MediaStream & { Index: number } =>
      s.Type === "Subtitle" && typeof s.Index === "number",
  );

  // An image subtitle burned into a transcoded download is in the pixels: it
  // cannot be turned off or swapped, so offering "Off" or any alternative would
  // advertise controls that cannot affect it.
  if (offlineTranscoded?.burnedInIndex !== undefined) {
    const burned = subtitleStreams.find(
      (s) => s.Index === offlineTranscoded.burnedInIndex,
    );
    if (burned && isImageBasedSubtitle(burned)) {
      return [
        {
          index: burned.Index,
          label: `${formatLabel(burned)} ${burnedInSuffix}`.trim(),
          selected: true,
          kind: "burnedIn",
          language: burned.Language ?? undefined,
          requiresReload: false,
        },
      ];
    }
  }

  const current = subtitleStreams.find((s) => s.Index === selectedIndex);

  const rows: TrackMenuRow[] = [
    {
      index: SUBTITLES_OFF,
      label: offLabel,
      selected: selectedIndex === SUBTITLES_OFF,
      kind: "off",
      requiresReload: isTranscoding && needsReprocessing(current),
    },
  ];

  for (const stream of [...subtitleStreams].sort(compareTracksForMenu)) {
    // Image subs are not present in a transcoded download — only the one that
    // was burned in was, and that is handled above.
    if (offlineTranscoded && isImageBasedSubtitle(stream)) continue;

    rows.push({
      index: stream.Index,
      label: formatLabel(stream),
      selected: stream.Index === selectedIndex,
      kind: "server",
      language: stream.Language ?? undefined,
      requiresReload:
        isTranscoding &&
        (needsReprocessing(stream) || needsReprocessing(current)),
    });
  }

  localSubs?.forEach((local, position) => {
    rows.push({
      index: localSubtitleIndex(position),
      label: local.name,
      selected: localSubtitleIndex(position) === selectedIndex,
      kind: "sidecar",
      requiresReload: false,
      localPath: local.filePath,
    });
  });

  return rows;
};

export interface AudioMenuOptions {
  selectedIndex?: number;
  isTranscoding: boolean;
  /** A transcoded download contains only the audio track it was encoded with. */
  offlineTranscoded?: boolean;
  formatLabel?: (stream: MediaStream) => string;
}

export const buildAudioMenu = (
  streams: MediaStream[] | null | undefined,
  options: AudioMenuOptions,
): TrackMenuRow[] => {
  const {
    selectedIndex,
    isTranscoding,
    offlineTranscoded,
    formatLabel = defaultLabel,
  } = options;

  return (streams ?? [])
    .filter(
      (s): s is MediaStream & { Index: number } =>
        s.Type === "Audio" && typeof s.Index === "number",
    )
    .filter((s) => !offlineTranscoded || s.Index === selectedIndex)
    .map((stream) => ({
      index: stream.Index,
      label: formatLabel(stream),
      selected: stream.Index === selectedIndex,
      kind: "server" as const,
      language: stream.Language ?? undefined,
      // A transcoded stream carries only the encoded track; any other choice
      // has to be re-negotiated with the server.
      requiresReload: isTranscoding,
    }));
};
