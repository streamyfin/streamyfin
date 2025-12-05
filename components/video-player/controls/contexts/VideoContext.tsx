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
import type { AudioTrack, SubtitleTrack } from "@/modules";
import type { Track } from "../types";
import { useControlContext } from "./ControlContext";

interface VideoContextProps {
  subtitleTracks: Track[] | null;
  audioTracks: Track[] | null;
  setSubtitleTrack: ((index: number) => void) | undefined;
  setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

const VideoContext = createContext<VideoContextProps | undefined>(undefined);

interface VideoProviderProps {
  children: ReactNode;
  getSubtitleTracks:
    | (() => Promise<SubtitleTrack[] | null>)
    | (() => SubtitleTrack[])
    | undefined;
  getAudioTracks:
    | (() => Promise<AudioTrack[] | null>)
    | (() => AudioTrack[])
    | undefined;
  setSubtitleTrack: ((index: number) => void) | undefined;
  setAudioTrack: ((index: number) => void) | undefined;
  setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

/**
s * Video context provider for managing subtitle and audio tracks.
 * MPV player is used for all playback.
 */
export const VideoProvider: React.FC<VideoProviderProps> = ({
  children,
  getSubtitleTracks,
  getAudioTracks,
  setSubtitleTrack,
  setAudioTrack,
  setSubtitleURL,
}) => {
  const [subtitleTracks, setSubtitleTracks] = useState<Track[] | null>(null);
  const [audioTracks, setAudioTracks] = useState<Track[] | null>(null);

  const ControlContext = useControlContext();
  const isVideoLoaded = ControlContext?.isVideoLoaded;
  const mediaSource = ControlContext?.mediaSource;

  const allSubs =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") || [];

  const { itemId, audioIndex, bitrateValue, subtitleIndex, playbackPosition } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
      playbackPosition: string;
    }>();

  const onTextBasedSubtitle = useMemo(() => {
    return (
      allSubs.find(
        (s) =>
          s.Index?.toString() === subtitleIndex &&
          (s.DeliveryMethod === SubtitleDeliveryMethod.Embed ||
            s.DeliveryMethod === SubtitleDeliveryMethod.Hls ||
            s.DeliveryMethod === SubtitleDeliveryMethod.External),
      ) || subtitleIndex === "-1"
    );
  }, [allSubs, subtitleIndex]);

  const setPlayerParams = ({
    chosenAudioIndex = audioIndex,
    chosenSubtitleIndex = subtitleIndex,
  }: {
    chosenAudioIndex?: string;
    chosenSubtitleIndex?: string;
  }) => {
    console.log("chosenSubtitleIndex", chosenSubtitleIndex);
    const queryParams = new URLSearchParams({
      itemId: itemId ?? "",
      audioIndex: chosenAudioIndex,
      subtitleIndex: chosenSubtitleIndex,
      mediaSourceId: mediaSource?.Id ?? "",
      bitrateValue: bitrateValue,
      playbackPosition: playbackPosition,
    }).toString();

    router.replace(`player/direct-player?${queryParams}` as any);
  };

  const setTrackParams = (
    _type: "subtitle",
    index: number,
    serverIndex: number,
  ) => {
    // If we're transcoding and we're going from a image based subtitle
    // to a text based subtitle, we need to change the player params.

    const shouldChangePlayerParams =
      mediaSource?.TranscodingUrl && !onTextBasedSubtitle;

    console.log("Set player params", index, serverIndex);
    if (shouldChangePlayerParams) {
      setPlayerParams({
        chosenSubtitleIndex: serverIndex.toString(),
      });
      return;
    }
    setSubtitleTrack?.(serverIndex);
    router.setParams({
      subtitleIndex: serverIndex.toString(),
    });
  };

  useEffect(() => {
    const fetchTracks = async () => {
      if (getSubtitleTracks) {
        let subtitleData: SubtitleTrack[] | null = null;
        try {
          subtitleData = await getSubtitleTracks();
          console.log("subtitleData", subtitleData);
        } catch (error) {
          console.log("[VideoContext] Failed to get subtitle tracks:", error);
          return;
        }

        let embedSubIndex = 1;
        const processedSubs: Track[] = allSubs?.map((sub) => {
          /** A boolean value determining if we should increment the embedSubIndex */
          const shouldIncrement =
            sub.DeliveryMethod === SubtitleDeliveryMethod.Embed ||
            sub.DeliveryMethod === SubtitleDeliveryMethod.Hls ||
            sub.DeliveryMethod === SubtitleDeliveryMethod.External;
          /** The index of subtitle inside MPV Player itself */
          const mpvIndex = subtitleData?.at(embedSubIndex)?.id ?? -1;
          if (shouldIncrement) embedSubIndex++;
          return {
            name: sub.DisplayTitle || "Undefined Subtitle",
            index: sub.Index ?? -1,
            setTrack: () =>
              shouldIncrement
                ? setTrackParams("subtitle", mpvIndex, sub.Index ?? -1)
                : setPlayerParams({
                    chosenSubtitleIndex: sub.Index?.toString(),
                  }),
          };
        });

        // Step 3: Restore the original order
        const subtitles: Track[] = processedSubs.sort(
          (a, b) => a.index - b.index,
        );

        // Add a "Disable Subtitles" option
        subtitles.unshift({
          name: "Disable",
          index: -1,
          setTrack: () =>
            !mediaSource?.TranscodingUrl || onTextBasedSubtitle
              ? setTrackParams("subtitle", -1, -1)
              : setPlayerParams({ chosenSubtitleIndex: "-1" }),
        });
        setSubtitleTracks(subtitles);
      }
    };
    fetchTracks();
  }, [isVideoLoaded, getSubtitleTracks]);

  // Fetch audio tracks
  useEffect(() => {
    const fetchAudioTracks = async () => {
      if (getAudioTracks) {
        let audioData: AudioTrack[] | null = null;
        try {
          audioData = await getAudioTracks();
          console.log("audioData", audioData);
        } catch (error) {
          console.log("[VideoContext] Failed to get audio tracks:", error);
          return;
        }

        const allAudio =
          mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];

        let embedAudioIndex = 0;
        const processedAudio: Track[] = allAudio?.map((audio) => {
          const mpvIndex = audioData?.at(embedAudioIndex)?.id ?? 1;
          embedAudioIndex++;
          return {
            name: audio.DisplayTitle || "Undefined Audio",
            index: audio.Index ?? -1,
            setTrack: () => {
              setAudioTrack?.(mpvIndex);
              router.setParams({
                audioIndex: audio.Index?.toString() ?? "0",
              });
            },
          };
        });

        setAudioTracks(processedAudio);
      }
    };
    fetchAudioTracks();
  }, [isVideoLoaded, getAudioTracks]);

  return (
    <VideoContext.Provider
      value={{
        subtitleTracks,
        audioTracks,
        setSubtitleTrack,
        setSubtitleURL,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
};

export const useVideoContext = () => {
  const context = useContext(VideoContext);
  if (context === undefined) {
    throw new Error("useVideoContext must be used within a VideoProvider");
  }
  return context;
};
