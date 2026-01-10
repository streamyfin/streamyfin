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
 * 2. MPV INDEX (track.mpvIndex)
 *    - MPV's internal track ID
 *    - MPV orders tracks as: [all embedded, then all external]
 *    - IDs: 1..embeddedCount for embedded, embeddedCount+1.. for external
 *    - Value of -1 means track needs replacePlayer() (e.g., burned-in sub)
 *
 * ============================================================================
 * SUBTITLE HANDLING
 * ============================================================================
 *
 * Embedded (DeliveryMethod.Embed):
 *   - Already in MPV's track list
 *   - Select via setSubtitleTrack(mpvId)
 *
 * External (DeliveryMethod.External):
 *   - Loaded into MPV on video start
 *   - Select via setSubtitleTrack(embeddedCount + externalPosition + 1)
 *
 * Image-based during transcoding:
 *   - Burned into video by Jellyfin, not in MPV
 *   - Requires replacePlayer() to change
 */

import { SubtitleDeliveryMethod } from "@jellyfin/sdk/lib/generated-client";
import { router, useLocalSearchParams } from "expo-router";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { MpvAudioTrack } from "@/modules";
import { isImageBasedSubtitle } from "@/utils/jellyfin/subtitleUtils";
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

  const { tracksReady, mediaSource, offline, downloadedItem } =
    usePlayerContext();
  const playerControls = usePlayerControls();

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

        // For text-based subs, they should still be available in the file
        let subIdx = 1;
        for (const sub of allSubs) {
          if (sub.IsTextSubtitleStream) {
            subs.push({
              name: sub.DisplayTitle || "Unknown",
              index: sub.Index ?? -1,
              mpvIndex: subIdx,
              setTrack: () => {
                playerControls.setSubtitleTrack(subIdx);
                router.setParams({ subtitleIndex: String(sub.Index) });
              },
            });
            subIdx++;
          } else if (sub.Index === downloadedSubtitleIndex) {
            // This image-based sub was burned in - show it but indicate it's active
            subs.push({
              name: `${sub.DisplayTitle || "Unknown"} (burned in)`,
              index: sub.Index ?? -1,
              mpvIndex: -1, // Can't be changed
              setTrack: () => {
                // Already burned in, just update params
                router.setParams({ subtitleIndex: String(sub.Index) });
              },
            });
          }
        }

        setSubtitleTracks(subs.sort((a, b) => a.index - b.index));
        return;
      }

      // MPV track handling
      const audioData = await playerControls.getAudioTracks().catch(() => null);
      const playerAudio = (audioData as MpvAudioTrack[]) ?? [];

      // Separate embedded vs external subtitles from Jellyfin's list
      // MPV orders tracks as: [all embedded, then all external]
      const embeddedSubs = allSubs.filter(
        (s) => s.DeliveryMethod === SubtitleDeliveryMethod.Embed,
      );
      const externalSubs = allSubs.filter(
        (s) => s.DeliveryMethod === SubtitleDeliveryMethod.External,
      );

      // Count embedded subs that will be in MPV
      // (excludes image-based subs during transcoding as they're burned in)
      const embeddedInPlayer = embeddedSubs.filter(
        (s) => !isTranscoding || !isImageBasedSubtitle(s),
      );

      const subs: Track[] = [];

      // Process all Jellyfin subtitles
      for (const sub of allSubs) {
        const isEmbedded = sub.DeliveryMethod === SubtitleDeliveryMethod.Embed;
        const isExternal =
          sub.DeliveryMethod === SubtitleDeliveryMethod.External;

        // For image-based subs during transcoding, need to refresh player
        if (isTranscoding && isImageBasedSubtitle(sub)) {
          subs.push({
            name: sub.DisplayTitle || "Unknown",
            index: sub.Index ?? -1,
            mpvIndex: -1,
            setTrack: () => {
              replacePlayer({ subtitleIndex: String(sub.Index) });
            },
          });
          continue;
        }

        // Calculate MPV track ID based on type
        // MPV IDs: [1..embeddedCount] for embedded, [embeddedCount+1..] for external
        let mpvId = -1;

        if (isEmbedded) {
          // Find position among embedded subs that are in player
          const embeddedPosition = embeddedInPlayer.findIndex(
            (s) => s.Index === sub.Index,
          );
          if (embeddedPosition !== -1) {
            mpvId = embeddedPosition + 1; // 1-based ID
          }
        } else if (isExternal) {
          // Find position among external subs, offset by embedded count
          const externalPosition = externalSubs.findIndex(
            (s) => s.Index === sub.Index,
          );
          if (externalPosition !== -1) {
            mpvId = embeddedInPlayer.length + externalPosition + 1;
          }
        }

        subs.push({
          name: sub.DisplayTitle || "Unknown",
          index: sub.Index ?? -1,
          mpvIndex: mpvId,
          setTrack: () => {
            // Transcoding + switching to/from image-based sub
            if (
              isTranscoding &&
              (isImageBasedSubtitle(sub) || isCurrentSubImageBased)
            ) {
              replacePlayer({ subtitleIndex: String(sub.Index) });
              return;
            }

            // Direct switch in player
            if (mpvId !== -1) {
              playerControls.setSubtitleTrack(mpvId);
              router.setParams({ subtitleIndex: String(sub.Index) });
              return;
            }

            // Fallback - refresh player
            replacePlayer({ subtitleIndex: String(sub.Index) });
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

      setSubtitleTracks(subs.sort((a, b) => a.index - b.index));
      setAudioTracks(audio);
    };

    fetchTracks();
  }, [tracksReady, mediaSource, offline, downloadedItem]);

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
