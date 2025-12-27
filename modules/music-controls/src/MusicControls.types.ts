import type { EventSubscription } from "expo-modules-core";

export type MusicNowPlayingMetadata = {
  title: string;
  artist?: string;
  albumTitle?: string;
  artworkUri?: string;
  duration?: number; // seconds
};

export type MusicPlaybackState = {
  isPlaying: boolean;
  position?: number; // seconds
  duration?: number; // seconds
};

export type MusicSeekToEvent = {
  position: number; // seconds
};

export interface MusicControlsModuleType {
  enable(): void;
  disable(): void;
  setNowPlaying(metadata: MusicNowPlayingMetadata): void;
  setPlaybackState(state: MusicPlaybackState): void;

  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): EventSubscription;
}
