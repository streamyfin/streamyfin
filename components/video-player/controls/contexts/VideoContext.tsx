/**
 * VideoContext.tsx
 *
 * Manages subtitle and audio track state for the video player UI.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * - Jellyfin is source of truth for subtitle list (embedded + external)
 * - MPV only knows about:
 *   - Embedded subs it finds in the video stream
 *   - External subs we explicitly add via addSubtitleFile()
 * - UI shows Jellyfin's complete list
 * - On selection: either select embedded track or load external URL
 *
 * ============================================================================
 * INDEX TYPES
 * ============================================================================
 *
 * 1. SERVER INDEX (sub.Index / track.index)
 *    - Jellyfin's server-side stream index
 *    - Used to report playback state to Jellyfin server
 *    - Value of -1 means disabled/none
 *
 * 2. PLAYER TRACK (selected by IDENTITY, not position)
 *    - Selection resolves the server Index against MPV's REAL track list via
 *      applyMpvSubtitleSelection: externals matched by external-filename,
 *      embedded by language/title. `track.mpvIndex` is no longer used to select
 *      (kept -1) — positional mapping mis-selected when externals/embedded were
 *      reordered or the server hid embedded subs (#954 et al.).
 *
 * ============================================================================
 * SUBTITLE HANDLING
 * ============================================================================
 *
 * Embedded & External:
 *   - Selected via applyMpvSubtitleSelection (identity match against the live
 *     track list). Menu order matches jellyfin-web (compareTracksForMenu:
 *     embedded first, externals last, forced/default float up).
 *
 * Image-based during transcoding:
 *   - Burned into video by Jellyfin, not in MPV → replacePlayer() to change.
 */

import { File } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import type { MpvAudioTrack } from "@/modules";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { useSettings } from "@/utils/atoms/settings";
import {
  applyMpvSubtitleSelection,
  getExternalSubtitleUrl,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import { rememberSeriesTrackFromRow } from "@/utils/seriesTrackMemory";
import {
  isLocalSubtitleIndex,
  SUBTITLES_OFF,
} from "@/utils/subtitles/subtitleIndex";
import {
  buildAudioMenu,
  buildSubtitleMenu,
  type TrackMenuRow,
} from "@/utils/subtitles/trackMenu";
import type { Track } from "../types";
import { usePlayerContext, usePlayerControls } from "./PlayerContext";

interface VideoContextProps {
  subtitleTracks: Track[] | null;
  audioTracks: Track[] | null;
}

const VideoContext = createContext<VideoContextProps | undefined>(undefined);

export const VideoProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [subtitleTracks, setSubtitleTracks] = useState<Track[] | null>(null);
  const [audioTracks, setAudioTracks] = useState<Track[] | null>(null);

  const { tracksReady, mediaSource, downloadedItem, item } = usePlayerContext();
  const playerControls = usePlayerControls();
  const offline = useOfflineMode();
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const { settings } = useSettings();

  /**
   * Persist a deliberate pick as the series preference, exactly as the native
   * player and the item pages do — a menu that changes the track but remembers
   * nothing is why the next episode used to come back on the server's default.
   *
   * Held in a ref rather than read directly by the effect below: `settings` gets
   * a new identity on every settings write, and depending on it would re-run the
   * whole track fetch (an async bridge round-trip) and briefly blank the menus
   * every time an unrelated toggle moved.
   */
  const rememberRef = useRef<
    (kind: "audio" | "subtitle", row: TrackMenuRow) => void
  >(() => {});
  rememberRef.current = (kind, row) =>
    rememberSeriesTrackFromRow({ item, kind, row, settings });

  const { itemId, audioIndex, bitrateValue, subtitleIndex, playbackPosition } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
    }>();

  const allSubs =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") || [];
  const allAudio =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];

  const isTranscoding = Boolean(mediaSource?.TranscodingUrl);

  // Route params are strings; a missing/blank one parses to NaN, which must not
  // be read as a real selection.
  const asIndex = (raw: string | undefined): number | undefined => {
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const currentSubtitleIndex = asIndex(subtitleIndex) ?? SUBTITLES_OFF;
  const currentAudioIndex = asIndex(audioIndex);

  /** Client-side downloads that still exist on disk (the cache may be cleared). */
  const localSubFiles = useMemo(() => {
    if (!Platform.isTV || !itemId) return [];
    return getSubtitlesForItem(itemId)
      .filter((s) => new File(s.filePath).exists)
      .map((s) => ({ name: s.name, filePath: s.filePath }));
  }, [itemId]);

  /**
   * Check if the currently selected subtitle is image-based.
   * Used to determine if we need to refresh the player when changing subs.
   */
  const isCurrentSubImageBased = useMemo(() => {
    if (subtitleIndex === "-1") return false;
    const currentSub = allSubs.find(
      (s) => s.Index?.toString() === subtitleIndex,
    );
    return currentSub ? isImageBasedSubtitle(currentSub) : false;
  }, [allSubs, subtitleIndex]);

  /**
   * Refresh the player with new parameters.
   * This triggers Jellyfin to re-process the stream (e.g., burn in image subs).
   */
  const replacePlayer = (params: {
    audioIndex?: string;
    subtitleIndex?: string;
  }) => {
    // The URL param can hold a local-sub sentinel (selected via setParams) that
    // only exists in the dying player — the server must get "none" (-1) instead.
    // NaN (missing/blank param) fails the comparison and passes through as-is.
    const fallbackSubtitleIndex = isLocalSubtitleIndex(
      Number.parseInt(subtitleIndex, 10),
    )
      ? "-1"
      : subtitleIndex;
    const queryParams = new URLSearchParams({
      itemId: itemId ?? "",
      audioIndex: params.audioIndex ?? audioIndex,
      subtitleIndex: params.subtitleIndex ?? fallbackSubtitleIndex,
      mediaSourceId: mediaSource?.Id ?? "",
      bitrateValue: bitrateValue,
      playbackPosition: playbackPosition,
    }).toString();
    router.replace(`player/direct-player?${queryParams}` as any);
  };

  // Fetch tracks when ready
  useEffect(() => {
    if (!tracksReady) return;

    // Guard every state commit against stale runs: api?.basePath /
    // isCurrentSubImageBased can flip mid-run and restart this effect, and an
    // earlier async run (which captured an old `api`) must not finish later and
    // overwrite the fresh track list with callbacks bound to stale closures.
    // The cleanup flips `cancelled`, so any late commit from a dead run is dropped.
    let cancelled = false;
    const commitSubtitleTracks = (next: Track[]) => {
      if (!cancelled) setSubtitleTracks(next);
    };
    const commitAudioTracks = (next: Track[]) => {
      if (!cancelled) setAudioTracks(next);
    };

    const fetchTracks = async () => {
      // Check if this is offline transcoded content
      // For transcoded offline content, only ONE audio track exists in the file
      const isOfflineTranscoded =
        offline && downloadedItem?.userData?.isTranscoded === true;

      if (isOfflineTranscoded) {
        // Build single audio track entry - only the downloaded track exists
        const downloadedAudioIndex = downloadedItem.userData.audioStreamIndex;
        const downloadedTrack = allAudio.find(
          (a) => a.Index === downloadedAudioIndex,
        );

        if (downloadedTrack) {
          const audio: Track[] = [
            {
              name: downloadedTrack.DisplayTitle || "Audio",
              index: downloadedTrack.Index ?? 0,
              mpvIndex: 1, // Only track in file (MPV uses 1-based indexing)
              setTrack: () => {
                // Track is already selected (only one available)
                router.setParams({ audioIndex: String(downloadedTrack.Index) });
              },
            },
          ];
          commitAudioTracks(audio);
        } else {
          // Fallback: show no audio tracks if the stored track wasn't found
          commitAudioTracks([]);
        }

        // A transcoded download carries only text subs; an image sub chosen at
        // download time was burned into the video and is inert — the builder
        // returns it as the sole row rather than advertising "Disable" and
        // alternatives that cannot affect pixels.
        const subs: Track[] = buildSubtitleMenu(allSubs, {
          selectedIndex: currentSubtitleIndex,
          offLabel: "Disable",
          isTranscoding: false,
          offlineTranscoded: {
            burnedInIndex: downloadedItem.userData.subtitleStreamIndex,
          },
          formatLabel: (s) => s.DisplayTitle || "Unknown",
        }).map((row) => ({
          name: row.label,
          index: row.index,
          mpvIndex: -1,
          setTrack: () => {
            // Inert by construction — the row exists only to show what is
            // baked into the file.
            if (row.kind === "burnedIn") return;
            rememberRef.current("subtitle", row);
            if (row.kind === "off") {
              playerControls.setSubtitleTrack(-1);
              router.setParams({ subtitleIndex: "-1" });
              return;
            }
            router.setParams({ subtitleIndex: String(row.index) });
            void applyMpvSubtitleSelection(playerControls, {
              subtitleStreams: allSubs,
              jellyfinSubtitleIndex: row.index,
              getExpectedExternalUrl: (s) =>
                getExternalSubtitleUrl(s, { offline, basePath: api?.basePath }),
            });
          },
        }));

        commitSubtitleTracks(subs);
        return;
      }

      // MPV track handling
      const audioData = await playerControls.getAudioTracks().catch(() => null);
      if (cancelled) return;
      const playerAudio = (audioData as MpvAudioTrack[]) ?? [];

      // Selection resolves against MPV's real track list by identity
      // (applyMpvSubtitleSelection) — never positional index math, which
      // mis-selects across external/embedded reordering and server-hidden
      // embedded subs (#954/#1690/#618/#1467/#976/#1451).
      const subs: Track[] = buildSubtitleMenu(allSubs, {
        selectedIndex: currentSubtitleIndex,
        offLabel: "Disable",
        isTranscoding,
        // TV is the only surface that can download a sidecar mid-playback.
        localSubs: Platform.isTV ? localSubFiles : undefined,
        formatLabel: (s) => s.DisplayTitle || "Unknown",
      }).map((row) => ({
        name: row.label,
        index: row.index,
        mpvIndex: -1,
        isLocal: row.kind === "sidecar",
        localPath: row.localPath,
        setTrack: () => {
          rememberRef.current("subtitle", row);
          if (row.kind === "sidecar" && row.localPath) {
            playerControls.addSubtitleFile(row.localPath, true);
            router.setParams({ subtitleIndex: String(row.index) });
            return;
          }
          // Burned-in image subs are pixels: switching to one, and switching
          // away from an active one, both need the server to re-process.
          if (row.requiresReload) {
            replacePlayer({ subtitleIndex: String(row.index) });
            return;
          }
          if (row.kind === "off") {
            playerControls.setSubtitleTrack(-1);
            router.setParams({ subtitleIndex: "-1" });
            return;
          }
          router.setParams({ subtitleIndex: String(row.index) });
          void applyMpvSubtitleSelection(playerControls, {
            subtitleStreams: allSubs,
            jellyfinSubtitleIndex: row.index,
            // Mirror how external subs are loaded into MPV (online: basePath +
            // DeliveryUrl, offline: local DeliveryUrl) so identity matching by
            // external-filename lines up.
            getExpectedExternalUrl: (s) =>
              getExternalSubtitleUrl(s, { offline, basePath: api?.basePath }),
          }).then((result) => {
            // Safety net: a menu-listed sub the player can't select (server-
            // burned Encode, sidecar never sub-added) only shows up after the
            // server re-processes the stream with it.
            if (result.kind === "notFound" || result.kind === "burnedIn") {
              replacePlayer({ subtitleIndex: String(row.index) });
            }
          });
        },
      }));

      const audio: Track[] = buildAudioMenu(allAudio, {
        selectedIndex: currentAudioIndex,
        isTranscoding,
        formatLabel: (a) => a.DisplayTitle || "Unknown",
      }).map((row) => {
        // mpv ids come from the player's own enumeration, so position against
        // the unfiltered stream list — not the row list, which drops streams
        // with no Index and would shift every id below the gap.
        const position = allAudio.findIndex((a) => a.Index === row.index);
        const mpvId = playerAudio[position]?.id ?? position + 1;

        return {
          name: row.label,
          index: row.index,
          mpvIndex: mpvId,
          setTrack: () => {
            rememberRef.current("audio", row);
            if (row.requiresReload) {
              replacePlayer({ audioIndex: String(row.index) });
              return;
            }
            playerControls.setAudioTrack(mpvId);
            router.setParams({ audioIndex: String(row.index) });
          },
        };
      });

      commitSubtitleTracks(subs);
      commitAudioTracks(audio);
    };

    fetchTracks();
    return () => {
      cancelled = true;
    };
    // api?.basePath: setTrack builds external-sub URLs from it — rebuild once the
    // API is ready so online externals don't resolve with undefined.
    // isCurrentSubImageBased: setTrack closes over it for the transcode replacePlayer
    // decision — rebuild when it flips so we refresh the stream when we should.
  }, [
    tracksReady,
    mediaSource,
    offline,
    downloadedItem,
    itemId,
    api?.basePath,
    isCurrentSubImageBased,
    localSubFiles,
    currentSubtitleIndex,
    currentAudioIndex,
  ]);

  return (
    <VideoContext.Provider value={{ subtitleTracks, audioTracks }}>
      {children}
    </VideoContext.Provider>
  );
};

export const useVideoContext = () => {
  const ctx = useContext(VideoContext);
  if (!ctx)
    throw new Error("useVideoContext must be used within VideoProvider");
  return ctx;
};
