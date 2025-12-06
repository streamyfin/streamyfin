/**
 * VideoContext.tsx
 *
 * Manages subtitle and audio track state for the video player UI.
 *
 * ============================================================================
 * INDEX TYPES
 * ============================================================================
 *
 * We track two different indices for each track:
 *
 * 1. SERVER INDEX (sub.Index / track.index)
 *    - Jellyfin's server-side stream index
 *    - Used to report playback state to Jellyfin server
 *    - Allows Jellyfin to remember user's last selected tracks
 *    - Passed via router params (subtitleIndex, audioIndex)
 *    - Value of -1 means disabled/none
 *
 * 2. MPV INDEX (track.mpvIndex)
 *    - MPV's internal track ID for the loaded track
 *    - Used to actually switch tracks in the player
 *    - Only assigned to tracks that are loaded into MPV
 *    - Value of -1 means track is not in MPV (e.g., burned-in image sub)
 *
 * ============================================================================
 * SUBTITLE DELIVERY METHODS
 * ============================================================================
 *
 * Jellyfin provides subtitles via different delivery methods:
 * - Embed: Subtitle is embedded in the container (MKV, MP4, etc.)
 * - Hls: Subtitle is delivered via HLS segments (during transcoding)
 * - External: Subtitle is delivered as a separate file URL
 * - Encode: Subtitle is burned into the video (image-based subs during transcode)
 *
 * Jellyfin also provides `IsTextSubtitleStream` boolean:
 * - true:  Text-based subtitle (SRT, ASS, VTT, etc.)
 * - false: Image-based subtitle (PGS, VOBSUB, DVDSUB, etc.)
 *
 * ============================================================================
 * SUBTITLE TYPES AND HOW THEY'RE HANDLED
 * ============================================================================
 *
 * 1. TEXT-BASED SUBTITLES (IsTextSubtitleStream = true)
 *    - Direct Play: Loaded into MPV (embedded or via sub-add for external)
 *    - Transcoding: Delivered via HLS, loaded into MPV
 *    - Action: Use playerControls.setSubtitleTrack(mpvId)
 *
 * 2. IMAGE-BASED SUBTITLES (IsTextSubtitleStream = false)
 *    - Direct Play: Embedded ones are in MPV, external ones are filtered out
 *    - Transcoding: BURNED INTO VIDEO by Jellyfin (not in MPV track list)
 *    - Action: When transcoding, use replacePlayer() to request burn-in
 *
 * ============================================================================
 * MPV INDEX CALCULATION
 * ============================================================================
 *
 * We iterate through Jellyfin's subtitle list and assign MPV indices only to
 * subtitles that are actually loaded into MPV:
 *
 * - isSubtitleInMpv = true:  Subtitle is in MPV's track list, increment index
 * - isSubtitleInMpv = false: Subtitle is NOT in MPV (e.g., image sub during
 *                            transcode), do NOT increment index
 *
 * The order of subtitles in Jellyfin's MediaStreams matches the order in MPV.
 */

import {
  type MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";
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
import type { AudioTrack, SubtitleTrack } from "@/modules";
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

  const { trackCount, mediaSource } = usePlayerContext();
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

  /** Check if subtitle is image-based (PGS, VOBSUB, etc.) */
  const isImageBased = (sub: MediaStream): boolean =>
    sub.IsTextSubtitleStream === false;

  /**
   * Check if the currently selected subtitle is image-based.
   * Used to determine if we need to refresh the player when changing subs.
   */
  const isCurrentSubImageBased = useMemo(() => {
    if (subtitleIndex === "-1") return false;
    const currentSub = allSubs.find(
      (s) => s.Index?.toString() === subtitleIndex,
    );
    return currentSub ? isImageBased(currentSub) : false;
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

  /**
   * Determine if a subtitle is available in MPV's track list.
   *
   * A subtitle is in MPV if:
   * - Delivery is Embed/Hls/External AND not an image-based sub during transcode
   */
  const isSubtitleInMpv = (sub: MediaStream): boolean => {
    // During transcoding, image-based subs are burned in, not in MPV
    if (isTranscoding && isImageBased(sub)) {
      return false;
    }

    // Embed/Hls/External methods mean the sub is loaded into MPV
    return (
      sub.DeliveryMethod === SubtitleDeliveryMethod.Embed ||
      sub.DeliveryMethod === SubtitleDeliveryMethod.Hls ||
      sub.DeliveryMethod === SubtitleDeliveryMethod.External
    );
  };

  // Fetch tracks when track count changes
  useEffect(() => {
    if (trackCount === 0) return;

    const fetchTracks = async () => {
      const [subtitleData, audioData] = await Promise.all([
        playerControls.getSubtitleTracks().catch(() => null),
        playerControls.getAudioTracks().catch(() => null),
      ]);

      // Process subtitles - map Jellyfin indices to MPV track IDs
      let mpvIndex = 0; // MPV track index counter (only incremented for subs in MPV)

      const subs: Track[] = allSubs.map((sub) => {
        const inMpv = isSubtitleInMpv(sub);

        // Get MPV track ID: only if this sub is actually in MPV's track list
        const mpvId = inMpv
          ? ((subtitleData as SubtitleTrack[])?.[mpvIndex++]?.id ?? -1)
          : -1;

        return {
          name: sub.DisplayTitle || "Unknown",
          index: sub.Index ?? -1, // Jellyfin server-side index
          mpvIndex: mpvId, // MPV track ID (-1 if not in MPV)
          setTrack: () => {
            // Case 1: Transcoding + switching to/from image-based sub
            // Need to refresh player so Jellyfin burns in the new sub
            if (
              isTranscoding &&
              (isImageBased(sub) || isCurrentSubImageBased)
            ) {
              replacePlayer({ subtitleIndex: String(sub.Index) });
              return;
            }

            // Case 2: Subtitle is in MPV - just switch tracks
            if (inMpv && mpvId !== -1) {
              playerControls.setSubtitleTrack(mpvId);
              router.setParams({ subtitleIndex: String(sub.Index) });
              return;
            }

            // Case 3: Fallback - refresh player
            replacePlayer({ subtitleIndex: String(sub.Index) });
          },
        };
      });

      // Add "Disable" option at the beginning
      subs.unshift({
        name: "Disable",
        index: -1,
        setTrack: () => {
          // If currently using image-based sub during transcode, need to refresh
          if (isTranscoding && isCurrentSubImageBased) {
            replacePlayer({ subtitleIndex: "-1" });
          } else {
            playerControls.setSubtitleTrack(-1);
            router.setParams({ subtitleIndex: "-1" });
          }
        },
      });

      // Process audio tracks
      const audio: Track[] = allAudio.map((a, idx) => ({
        name: a.DisplayTitle || "Unknown",
        index: a.Index ?? -1,
        setTrack: () => {
          // Transcoding: need full player refresh to change audio stream
          if (isTranscoding) {
            replacePlayer({ audioIndex: String(a.Index) });
            return;
          }

          // Direct play: just switch audio track in MPV
          const mpvId = (audioData as AudioTrack[])?.[idx]?.id ?? idx + 1;
          playerControls.setAudioTrack(mpvId);
          router.setParams({ audioIndex: String(a.Index) });
        },
      }));

      setSubtitleTracks(subs.sort((a, b) => a.index - b.index));
      setAudioTracks(audio);
    };

    fetchTracks();
  }, [trackCount, mediaSource]);

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
