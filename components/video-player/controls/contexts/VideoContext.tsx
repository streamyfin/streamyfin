import { TrackInfo } from '@/modules/vlc-player';
import { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useControlContext } from './ControlContext';

interface VideoContextProps {
    audioTracks: TrackInfo[] | null;
    subtitleTracks: TrackInfo[] | null;
    setAudioTrack: ((index: number) => void) | undefined;
    setSubtitleTrack: ((index: number) => void) | undefined;
    setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

const VideoContext = createContext<VideoContextProps | undefined>(undefined);

interface VideoProviderProps {
  children: ReactNode;
  getAudioTracks: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]) | undefined;
  getSubtitleTracks: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]) | undefined;
  setAudioTrack: ((index: number) => void) | undefined;
  setSubtitleTrack: ((index: number) => void) | undefined;
  setSubtitleURL: ((url: string, customName: string) => void) | undefined;
}

export const VideoProvider: React.FC<VideoProviderProps> = ({ children, getSubtitleTracks, getAudioTracks, setSubtitleTrack, setSubtitleURL, setAudioTrack }) => {
    const [audioTracks, setAudioTracks] = useState<TrackInfo[] | null>(null);
    const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[] | null>(
      null
    );

    const ControlContext = useControlContext();
    const isVideoLoaded = ControlContext?.isVideoLoaded;

    useEffect(() => {
      const fetchTracks = async () => {
        if (getSubtitleTracks) {
          const subtitles = await getSubtitleTracks();
          console.log("Getting embeded subtitles...", subtitles);
          setSubtitleTracks(subtitles);
        }
        if (getAudioTracks) {
          const audio = await getAudioTracks();
          setAudioTracks(audio);
        }
      };
      fetchTracks();
    }, [isVideoLoaded, getAudioTracks, getSubtitleTracks]);

  return (
    <VideoContext.Provider value={{ audioTracks, subtitleTracks, setSubtitleTrack, setSubtitleURL, setAudioTrack }}>
      {children}
    </VideoContext.Provider>
  );
};

export const useVideoContext = () => {
  const context = useContext(VideoContext);
  if (context === undefined) {
    throw new Error('useVideoContext must be used within a VideoProvider');
  }
  return context;
};