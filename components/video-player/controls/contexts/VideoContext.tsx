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
import type { TrackInfo } from "@/modules/VlcPlayer.types";
import { writeDebugLog } from "@/utils/log";
import type { Track } from "../types";
import { useControlContext } from "./ControlContext";

interface VideoContextProps {
  audioTracks: Track[] | null;
  subtitleTracks: Track[] | null;
  setAudioTrack: ((index: number) => void) | undefined;
  setSubtitleTrack: ((index: number) => void) | undefined;
  setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

const VideoContext = createContext<VideoContextProps | undefined>(undefined);

interface VideoProviderProps {
  children: ReactNode;
  getAudioTracks:
    | (() => Promise<TrackInfo[] | null>)
    | (() => TrackInfo[])
    | undefined;
  getSubtitleTracks:
    | (() => Promise<TrackInfo[] | null>)
    | (() => TrackInfo[])
    | undefined;
  setAudioTrack: ((index: number) => void) | undefined;
  setSubtitleTrack: ((index: number) => void) | undefined;
  setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

export const VideoProvider: React.FC<VideoProviderProps> = ({
  children,
  getSubtitleTracks,
  getAudioTracks,
  setSubtitleTrack,
  setSubtitleURL,
  setAudioTrack,
}) => {
  const [audioTracks, setAudioTracks] = useState<Track[] | null>(null);
  const [subtitleTracks, setSubtitleTracks] = useState<Track[] | null>(null);

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
    writeDebugLog("video.setPlayerParams", { chosenSubtitleIndex });
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
    type: "audio" | "subtitle",
    index: number,
    serverIndex: number,
  ) => {
    const setTrack = type === "audio" ? setAudioTrack : setSubtitleTrack;
    const paramKey = type === "audio" ? "audioIndex" : "subtitleIndex";

    // If we're transcoding and we're going from a image based subtitle
    // to a text based subtitle, we need to change the player params.

    const shouldChangePlayerParams =
      type === "subtitle" &&
      mediaSource?.TranscodingUrl &&
      !onTextBasedSubtitle;

    writeDebugLog("video.setTrackParams", { type, index, serverIndex });
    if (shouldChangePlayerParams) {
      setPlayerParams({
        chosenSubtitleIndex: serverIndex.toString(),
      });
      return;
    }
    setTrack?.(index);
    router.setParams({
      [paramKey]: serverIndex.toString(),
    });
  };

  // Extract subtitle track creation to reduce nesting
  const createSubtitleTrack = (
    sub: any,
    subtitleData: TrackInfo[] | null,
    embedSubIndex: { current: number },
  ): Track => {
    const shouldIncrement =
      sub.DeliveryMethod === SubtitleDeliveryMethod.Embed ||
      sub.DeliveryMethod === SubtitleDeliveryMethod.Hls ||
      sub.DeliveryMethod === SubtitleDeliveryMethod.External;

    const vlcIndex = subtitleData?.at(embedSubIndex.current)?.index ?? -1;
    if (shouldIncrement) embedSubIndex.current++;

    const handleSetTrack = () => {
      if (shouldIncrement) {
        setTrackParams("subtitle", vlcIndex, sub.Index ?? -1);
      } else {
        setPlayerParams({ chosenSubtitleIndex: sub.Index?.toString() });
      }
    };

    return {
      name: sub.DisplayTitle || "Undefined Subtitle",
      index: sub.Index ?? -1,
      setTrack: handleSetTrack,
    };
  };

  // Extract audio track creation to reduce nesting
  const createAudioTrack = (
    audio: any,
    idx: number,
    audioData: TrackInfo[] | null,
  ): Track => {
    const handleSetTrack = () => {
      if (!mediaSource?.TranscodingUrl) {
        const vlcIndex = audioData?.at(idx + 1)?.index ?? -1;
        setTrackParams("audio", vlcIndex, audio.Index ?? -1);
      } else {
        setPlayerParams({ chosenAudioIndex: audio.Index?.toString() });
      }
    };

    return {
      name: audio.DisplayTitle ?? "Undefined Audio",
      index: audio.Index ?? -1,
      setTrack: handleSetTrack,
    };
  };

  useEffect(() => {
    const fetchTracks = async () => {
      if (getSubtitleTracks) {
        let subtitleData = await getSubtitleTracks();
        // Only FOR VLC 3, If we're transcoding, we need to reverse the subtitle data, because VLC reverses the HLS subtitles.
        if (
          mediaSource?.TranscodingUrl &&
          subtitleData &&
          subtitleData.length > 1
        ) {
          subtitleData = [subtitleData[0], ...subtitleData.slice(1).reverse()];
        }

        const embedSubIndex = { current: 1 };
        const processedSubs: Track[] = allSubs?.map((sub) =>
          createSubtitleTrack(sub, subtitleData, embedSubIndex),
        );

        // Step 3: Restore the original order
        const subtitles: Track[] = processedSubs.toSorted(
          (a, b) => a.index - b.index,
        );

        // Add a "Disable Subtitles" option
        const disableSubtitleTrack = {
          name: "Disable",
          index: -1,
          setTrack: () => {
            if (!mediaSource?.TranscodingUrl || onTextBasedSubtitle) {
              setTrackParams("subtitle", -1, -1);
            } else {
              setPlayerParams({ chosenSubtitleIndex: "-1" });
            }
          },
        };
        subtitles.unshift(disableSubtitleTrack);
        setSubtitleTracks(subtitles);
      }
      if (getAudioTracks) {
        const audioData = await getAudioTracks();
        const allAudio =
          mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];
        const audioTracks: Track[] = allAudio?.map((audio, idx) =>
          createAudioTrack(audio, idx, audioData),
        );

        // Add a "Disable Audio" option if its not transcoding.
        if (!mediaSource?.TranscodingUrl) {
          const disableAudioTrack = {
            name: "Disable",
            index: -1,
            setTrack: () => setTrackParams("audio", -1, -1),
          };
          audioTracks.unshift(disableAudioTrack);
        }
        setAudioTracks(audioTracks);
      }
    };
    fetchTracks();
  }, [isVideoLoaded, getAudioTracks, getSubtitleTracks]);

  const contextValue = useMemo(
    () => ({
      audioTracks,
      subtitleTracks,
      setSubtitleTrack,
      setSubtitleURL,
      setAudioTrack,
    }),
    [
      audioTracks,
      subtitleTracks,
      setSubtitleTrack,
      setSubtitleURL,
      setAudioTrack,
    ],
  );

  return (
    <VideoContext.Provider value={contextValue}>
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
