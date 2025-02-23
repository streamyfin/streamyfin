import { TrackInfo } from "@/modules/vlc-player";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
} from "react";
import { useControlContext } from "./ControlContext";
import { Track } from "../types";
import { router, useLocalSearchParams } from "expo-router";

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

  const { itemId, audioIndex, bitrateValue, subtitleIndex } =
    useLocalSearchParams<{
      itemId: string;
      audioIndex: string;
      subtitleIndex: string;
      mediaSourceId: string;
      bitrateValue: string;
    }>();

  const onTextBasedSubtitle = useMemo(
    () =>
      allSubs.find(
        (s) => s.Index?.toString() === subtitleIndex && s.IsTextSubtitleStream
      ) || subtitleIndex === "-1",
    [allSubs, subtitleIndex]
  );

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
    }).toString();

    //@ts-ignore
    router.replace(`player/direct-player?${queryParams}`);
  };

  const setTrackParams = (
    type: "audio" | "subtitle",
    index: number,
    serverIndex: number
  ) => {
    const setTrack = type === "audio" ? setAudioTrack : setSubtitleTrack;
    const paramKey = type === "audio" ? "audioIndex" : "subtitleIndex";

    // If we're transcoding and we're going from a image based subtitle
    // to a text based subtitle, we need to change the player params.

    const shouldChangePlayerParams =
      type === "subtitle" &&
      mediaSource?.TranscodingUrl &&
      !onTextBasedSubtitle;

    console.log("Set player params", index, serverIndex);
    if (shouldChangePlayerParams) {
      setPlayerParams({
        chosenSubtitleIndex: serverIndex.toString(),
      });
      return;
    }
    setTrack && setTrack(index);
    router.setParams({
      [paramKey]: serverIndex.toString(),
    });
  };

  useEffect(() => {
    const fetchTracks = async () => {
      if (getSubtitleTracks) {
        const subtitleData = await getSubtitleTracks();

        let textSubIndex = 0;
        const subtitles: Track[] = allSubs?.map((sub) => {
          // Always increment for non-transcoding subtitles
          // Only increment for text-based subtitles when transcoding
          const shouldIncrement =
            !mediaSource?.TranscodingUrl || sub.IsTextSubtitleStream;

          const displayTitle = sub.DisplayTitle || "Undefined Subtitle";
          const vlcIndex = subtitleData?.at(textSubIndex)?.index ?? -1;

          const finalIndex = shouldIncrement ? vlcIndex : sub.Index ?? -1;

          if (shouldIncrement) textSubIndex++;
          return {
            name: displayTitle,
            index: sub.Index ?? -1,
            originalIndex: finalIndex,
            setTrack: () =>
              shouldIncrement
                ? setTrackParams("subtitle", finalIndex, sub.Index ?? -1)
                : setPlayerParams({
                    chosenSubtitleIndex: sub.Index?.toString(),
                  }),
          };
        });

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
      if (
        getAudioTracks &&
        (audioTracks === null || audioTracks.length === 0)
      ) {
        const audioData = await getAudioTracks();
        if (!audioData) return;

        console.log("audioData", audioData);

        const allAudio =
          mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];

        const audioTracks: Track[] = allAudio?.map((audio, idx) => {
          if (!mediaSource?.TranscodingUrl) {
            const vlcIndex = audioData?.at(idx)?.index ?? -1;
            return {
              name: audio.DisplayTitle ?? "Undefined Audio",
              index: audio.Index ?? -1,
              setTrack: () =>
                setTrackParams("audio", vlcIndex, audio.Index ?? -1),
            };
          }
          return {
            name: audio.DisplayTitle ?? "Undefined Audio",
            index: audio.Index ?? -1,
            setTrack: () =>
              setPlayerParams({ chosenAudioIndex: audio.Index?.toString() }),
          };
        });
        setAudioTracks(audioTracks);
      }
    };
    fetchTracks();
  }, [isVideoLoaded, getAudioTracks, getSubtitleTracks]);

  return (
    <VideoContext.Provider
      value={{
        audioTracks,
        subtitleTracks,
        setSubtitleTrack,
        setSubtitleURL,
        setAudioTrack,
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
