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
  useState,
} from "react";
import { Platform } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import type { MpvAudioTrack } from "@/modules";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import {
  applyMpvSubtitleSelection,
  compareTracksForMenu,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import type { Track } from "../types";
import { usePlayerContext, usePlayerControls } from "./PlayerContext";

// Starting index for local (client-downloaded) subtitles
// Uses negative indices to avoid collision with Jellyfin indices
const LOCAL_SUBTITLE_INDEX_START = -100;

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

  const { tracksReady, mediaSource, downloadedItem } = usePlayerContext();
  const playerControls = usePlayerControls();
  const offline = useOfflineMode();
  const api = useAtomValue(apiAtom);
  const router = useRouter();

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
    const queryParams = new URLSearchParams({
      itemId: itemId ?? "",
      audioIndex: params.audioIndex ?? audioIndex,
      subtitleIndex: params.subtitleIndex ?? subtitleIndex,
      mediaSourceId: mediaSource?.Id ?? "",
      bitrateValue: bitrateValue,
      playbackPosition: playbackPosition,
    }).toString();
    router.replace(`player/direct-player?${queryParams}` as any);
  };

  // Fetch tracks when ready
  useEffect(() => {
    if (!tracksReady) return;

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
          setAudioTracks(audio);
        } else {
          // Fallback: show no audio tracks if the stored track wasn't found
          setAudioTracks([]);
        }

        // For subtitles in transcoded offline content:
        // - Text-based subs may still be embedded
        // - Image-based subs were burned in during transcoding
        const downloadedSubtitleIndex =
          downloadedItem.userData.subtitleStreamIndex;
        const subs: Track[] = [];

        // Add "Disable" option
        subs.push({
          name: "Disable",
          index: -1,
          mpvIndex: -1,
          setTrack: () => {
            playerControls.setSubtitleTrack(-1);
            router.setParams({ subtitleIndex: "-1" });
          },
        });

        // Text subs are muxed into the transcoded file; the burned-in image sub
        // can't be switched. Selection resolves by identity against MPV's real
        // track list (same as online) — robust to the transcoded file's track
        // structure differing from the original MediaStreams. Order matches web.
        for (const sub of [...allSubs].sort(compareTracksForMenu)) {
          if (sub.IsTextSubtitleStream) {
            subs.push({
              name: sub.DisplayTitle || "Unknown",
              index: sub.Index ?? -1,
              mpvIndex: -1,
              setTrack: () => {
                router.setParams({ subtitleIndex: String(sub.Index) });
                void applyMpvSubtitleSelection(playerControls, {
                  subtitleStreams: allSubs,
                  jellyfinSubtitleIndex: sub.Index ?? -1,
                  getExpectedExternalUrl: (s) => {
                    if (!s.DeliveryUrl) return undefined;
                    if (offline) return s.DeliveryUrl;
                    return api?.basePath
                      ? `${api.basePath}${s.DeliveryUrl}`
                      : undefined;
                  },
                });
              },
            });
          } else if (sub.Index === downloadedSubtitleIndex) {
            // Image-based sub burned in during transcode — can't switch, show as active.
            subs.push({
              name: `${sub.DisplayTitle || "Unknown"} (burned in)`,
              index: sub.Index ?? -1,
              mpvIndex: -1,
              setTrack: () => {
                router.setParams({ subtitleIndex: String(sub.Index) });
              },
            });
          }
        }

        setSubtitleTracks(subs);
        return;
      }

      // MPV track handling
      const audioData = await playerControls.getAudioTracks().catch(() => null);
      const playerAudio = (audioData as MpvAudioTrack[]) ?? [];

      const subs: Track[] = [];

      // Process all Jellyfin subtitles. Selection resolves against MPV's real
      // track list by identity (applyMpvSubtitleSelection) — never positional
      // index math, which mis-selects across external/embedded reordering and
      // server-hidden embedded subs (#954/#1690/#618/#1467/#976/#1451).
      // Order matches jellyfin-web (embedded first, externals last, forced/default up).
      for (const sub of [...allSubs].sort(compareTracksForMenu)) {
        // Image-based subs during transcoding are burned into the video by the
        // server; both switching TO one and switching AWAY from a currently
        // active one require a player refresh (re-transcode), not a track change.
        const needsReplace =
          isTranscoding &&
          (isImageBasedSubtitle(sub) || isCurrentSubImageBased);

        subs.push({
          name: sub.DisplayTitle || "Unknown",
          index: sub.Index ?? -1,
          mpvIndex: -1,
          setTrack: () => {
            if (needsReplace) {
              replacePlayer({ subtitleIndex: String(sub.Index) });
              return;
            }
            router.setParams({ subtitleIndex: String(sub.Index) });
            void applyMpvSubtitleSelection(playerControls, {
              subtitleStreams: allSubs,
              jellyfinSubtitleIndex: sub.Index ?? -1,
              // Mirror how external subs are loaded into MPV (online: basePath +
              // DeliveryUrl, offline: local DeliveryUrl) so identity matching by
              // external-filename lines up.
              getExpectedExternalUrl: (s) => {
                if (!s.DeliveryUrl) return undefined;
                if (offline) return s.DeliveryUrl;
                return api?.basePath
                  ? `${api.basePath}${s.DeliveryUrl}`
                  : undefined;
              },
            });
          },
        });
      }

      // Add "Disable" option at the beginning
      subs.unshift({
        name: "Disable",
        index: -1,
        mpvIndex: -1,
        setTrack: () => {
          if (isTranscoding && isCurrentSubImageBased) {
            replacePlayer({ subtitleIndex: "-1" });
          } else {
            playerControls.setSubtitleTrack(-1);
            router.setParams({ subtitleIndex: "-1" });
          }
        },
      });

      // Process audio tracks
      const audio: Track[] = allAudio.map((a, idx) => {
        const playerTrack = playerAudio[idx];
        const mpvId = playerTrack?.id ?? idx + 1;

        return {
          name: a.DisplayTitle || "Unknown",
          index: a.Index ?? -1,
          mpvIndex: mpvId,
          setTrack: () => {
            if (isTranscoding) {
              replacePlayer({ audioIndex: String(a.Index) });
              return;
            }
            playerControls.setAudioTrack(mpvId);
            router.setParams({ audioIndex: String(a.Index) });
          },
        };
      });

      // TV only: Merge locally downloaded subtitles (from OpenSubtitles)
      if (Platform.isTV && itemId) {
        const localSubs = getSubtitlesForItem(itemId);
        let localIdx = 0;
        for (const localSub of localSubs) {
          // Verify file still exists (cache may have been cleared)
          const subtitleFile = new File(localSub.filePath);
          if (!subtitleFile.exists) {
            continue;
          }

          const localIndex = LOCAL_SUBTITLE_INDEX_START - localIdx;
          subs.push({
            name: localSub.name,
            index: localIndex,
            mpvIndex: -1, // Will be loaded dynamically via addSubtitleFile
            isLocal: true,
            localPath: localSub.filePath,
            setTrack: () => {
              // Add the subtitle file to MPV and select it
              playerControls.addSubtitleFile(localSub.filePath, true);
              router.setParams({ subtitleIndex: String(localIndex) });
            },
          });
          localIdx++;
        }
      }

      // Already in jellyfin-web order (sorted iteration above); "Disable" stays
      // at the front (unshifted), local downloaded subs at the end.
      setSubtitleTracks(subs);
      setAudioTracks(audio);
    };

    fetchTracks();
  }, [tracksReady, mediaSource, offline, downloadedItem, itemId]);

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
