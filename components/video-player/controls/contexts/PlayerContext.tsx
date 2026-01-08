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
import type { SfPlayerViewRef, VlcPlayerViewRef } from "@/modules";

// Union type for both player refs
type PlayerRef = SfPlayerViewRef | VlcPlayerViewRef;

interface PlayerContextProps {
  playerRef: MutableRefObject<PlayerRef | null>;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean;
  tracksReady: boolean;
  useVlcPlayer: boolean;
}

const PlayerContext = createContext<PlayerContextProps | undefined>(undefined);

interface PlayerProviderProps {
  children: ReactNode;
  playerRef: MutableRefObject<PlayerRef | null>;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo | null | undefined;
  isVideoLoaded: boolean;
  tracksReady: boolean;
  useVlcPlayer: boolean;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({
  children,
  playerRef,
  item,
  mediaSource,
  isVideoLoaded,
  tracksReady,
  useVlcPlayer,
}) => {
  const value = useMemo(
    () => ({
      playerRef,
      item,
      mediaSource,
      isVideoLoaded,
      tracksReady,
      useVlcPlayer,
    }),
    [playerRef, item, mediaSource, isVideoLoaded, tracksReady, useVlcPlayer],
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

// Player controls hook - supports both SfPlayer (iOS) and VlcPlayer (Android)
export const usePlayerControls = () => {
  const { playerRef } = usePlayerContext();

  // Helper to get SfPlayer-specific ref (for iOS-only features)
  const getSfRef = () => playerRef.current as SfPlayerViewRef | null;

  return {
    // Subtitle controls (both players support these, but with different interfaces)
    getSubtitleTracks: async () => {
      return playerRef.current?.getSubtitleTracks?.() ?? null;
    },
    setSubtitleTrack: (trackId: number) => {
      playerRef.current?.setSubtitleTrack?.(trackId);
    },
    // iOS only (SfPlayer)
    disableSubtitles: () => {
      getSfRef()?.disableSubtitles?.();
    },
    addSubtitleFile: (url: string, select = true) => {
      getSfRef()?.addSubtitleFile?.(url, select);
    },

    // Audio controls (both players)
    getAudioTracks: async () => {
      return playerRef.current?.getAudioTracks?.() ?? null;
    },
    setAudioTrack: (trackId: number) => {
      playerRef.current?.setAudioTrack?.(trackId);
    },

    // Playback controls (both players)
    play: () => playerRef.current?.play?.(),
    pause: () => playerRef.current?.pause?.(),
    seekTo: (position: number) => playerRef.current?.seekTo?.(position),
    // iOS only (SfPlayer)
    seekBy: (offset: number) => getSfRef()?.seekBy?.(offset),
    setSpeed: (speed: number) => getSfRef()?.setSpeed?.(speed),

    // Subtitle positioning - iOS only (SfPlayer)
    setSubtitleScale: (scale: number) => getSfRef()?.setSubtitleScale?.(scale),
    setSubtitlePosition: (position: number) =>
      getSfRef()?.setSubtitlePosition?.(position),
    setSubtitleMarginY: (margin: number) =>
      getSfRef()?.setSubtitleMarginY?.(margin),
    setSubtitleFontSize: (size: number) =>
      getSfRef()?.setSubtitleFontSize?.(size),

    // PiP (both players)
    startPictureInPicture: () => playerRef.current?.startPictureInPicture?.(),
    // iOS only (SfPlayer)
    stopPictureInPicture: () => getSfRef()?.stopPictureInPicture?.(),
  };
};
