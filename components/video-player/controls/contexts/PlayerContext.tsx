import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import React, {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import type { MpvPlayerViewRef } from "@/modules";
import type { DownloadedItem } from "@/providers/Downloads/types";

interface PlayerContextProps {
  playerRef: MutableRefObject<MpvPlayerViewRef | null>;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean;
  tracksReady: boolean;
  offline: boolean;
  downloadedItem: DownloadedItem | null;
}

const PlayerContext = createContext<PlayerContextProps | undefined>(undefined);

interface PlayerProviderProps {
  children: ReactNode;
  playerRef: MutableRefObject<MpvPlayerViewRef | null>;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean;
  tracksReady: boolean;
  offline?: boolean;
  downloadedItem?: DownloadedItem | null;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({
  children,
  playerRef,
  item,
  mediaSource,
  isVideoLoaded,
  tracksReady,
  offline = false,
  downloadedItem = null,
}) => {
  const value = useMemo(
    () => ({
      playerRef,
      item,
      mediaSource,
      isVideoLoaded,
      tracksReady,
      offline,
      downloadedItem,
    }),
    [
      playerRef,
      item,
      mediaSource,
      isVideoLoaded,
      tracksReady,
      offline,
      downloadedItem,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
};

// Core context hook
export const usePlayerContext = () => {
  const context = useContext(PlayerContext);
  if (!context)
    throw new Error("usePlayerContext must be used within PlayerProvider");
  return context;
};

// Player controls hook - MPV player only
export const usePlayerControls = () => {
  const { playerRef } = usePlayerContext();

  return {
    // Subtitle controls
    getSubtitleTracks: async () => {
      return playerRef.current?.getSubtitleTracks?.() ?? null;
    },
    setSubtitleTrack: (trackId: number) => {
      playerRef.current?.setSubtitleTrack?.(trackId);
    },
    disableSubtitles: () => {
      playerRef.current?.disableSubtitles?.();
    },
    addSubtitleFile: (url: string, select = true) => {
      playerRef.current?.addSubtitleFile?.(url, select);
    },

    // Audio controls
    getAudioTracks: async () => {
      return playerRef.current?.getAudioTracks?.() ?? null;
    },
    setAudioTrack: (trackId: number) => {
      playerRef.current?.setAudioTrack?.(trackId);
    },

    // Playback controls
    play: () => playerRef.current?.play?.(),
    pause: () => playerRef.current?.pause?.(),
    seekTo: (position: number) => playerRef.current?.seekTo?.(position),
    seekBy: (offset: number) => playerRef.current?.seekBy?.(offset),
    setSpeed: (speed: number) => playerRef.current?.setSpeed?.(speed),

    // Subtitle positioning
    setSubtitleScale: (scale: number) =>
      playerRef.current?.setSubtitleScale?.(scale),
    setSubtitlePosition: (position: number) =>
      playerRef.current?.setSubtitlePosition?.(position),
    setSubtitleMarginY: (margin: number) =>
      playerRef.current?.setSubtitleMarginY?.(margin),
    setSubtitleFontSize: (size: number) =>
      playerRef.current?.setSubtitleFontSize?.(size),

    // PiP
    startPictureInPicture: () => playerRef.current?.startPictureInPicture?.(),
    stopPictureInPicture: () => playerRef.current?.stopPictureInPicture?.(),
  };
};
