import type { EventSubscription } from "expo-modules-core";
import type {
  MusicNowPlayingMetadata,
  MusicPlaybackState,
  MusicSeekToEvent,
} from "./src/MusicControls.types";
import MusicControlsModule from "./src/MusicControlsModule";

export interface MusicControls {
  enable(): void;
  disable(): void;
  setNowPlaying(metadata: MusicNowPlayingMetadata): void;
  setPlaybackState(state: MusicPlaybackState): void;

  addPlayListener(listener: () => void): EventSubscription;
  addPauseListener(listener: () => void): EventSubscription;
  addTogglePlayPauseListener(listener: () => void): EventSubscription;
  addNextListener(listener: () => void): EventSubscription;
  addPreviousListener(listener: () => void): EventSubscription;
  addSeekToListener(
    listener: (event: MusicSeekToEvent) => void,
  ): EventSubscription;
}

const MusicControls: MusicControls = {
  enable(): void {
    MusicControlsModule.enable();
  },

  disable(): void {
    MusicControlsModule.disable();
  },

  setNowPlaying(metadata: MusicNowPlayingMetadata): void {
    MusicControlsModule.setNowPlaying(metadata);
  },

  setPlaybackState(state: MusicPlaybackState): void {
    MusicControlsModule.setPlaybackState(state);
  },

  addPlayListener(listener: () => void): EventSubscription {
    return MusicControlsModule.addListener("onPlay", listener);
  },

  addPauseListener(listener: () => void): EventSubscription {
    return MusicControlsModule.addListener("onPause", listener);
  },

  addTogglePlayPauseListener(listener: () => void): EventSubscription {
    return MusicControlsModule.addListener("onTogglePlayPause", listener);
  },

  addNextListener(listener: () => void): EventSubscription {
    return MusicControlsModule.addListener("onNext", listener);
  },

  addPreviousListener(listener: () => void): EventSubscription {
    return MusicControlsModule.addListener("onPrevious", listener);
  },

  addSeekToListener(
    listener: (event: MusicSeekToEvent) => void,
  ): EventSubscription {
    return MusicControlsModule.addListener("onSeekTo", listener);
  },
};

export default MusicControls;
export type { MusicNowPlayingMetadata, MusicPlaybackState, MusicSeekToEvent };
