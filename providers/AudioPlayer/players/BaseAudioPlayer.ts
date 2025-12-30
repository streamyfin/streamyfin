// Base interface for all audio player implementations
import type { AudioPlayerAdapter } from "../player.types";
import type { AudioTrack, RepeatMode } from "../types";

/**
 * Player type enum
 */
export type PlayerType = "streaming" | "local" | "remote";

/**
 * State snapshot for transitioning between player modes
 */
export interface PlayerState {
  track: AudioTrack;
  position: number;
  isPlaying: boolean;
  queue: AudioTrack[];
  queueIndex: number;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
}

/**
 * Extended audio player interface with lifecycle management
 * for seamless transitions between playback modes
 */
export interface BaseAudioPlayer extends AudioPlayerAdapter {
  /**
   * Get the type of this player
   */
  getPlayerType(): PlayerType;

  /**
   * Check if this player can handle the given track
   */
  canHandleTrack(track: AudioTrack): boolean;

  /**
   * Capture current state before switching to another player
   * This allows seamless transitions between playback modes
   */
  suspend(): Promise<PlayerState>;

  /**
   * Restore state after switching from another player
   * This resumes playback from the exact position
   */
  resume(state: PlayerState): Promise<void>;

  /**
   * Set volume (primarily for remote players)
   */
  setVolume?(volume: number): Promise<void>;
}
