import type { AudioTrack, RepeatMode } from "./types";

/**
 * Playback status information
 */
export interface PlaybackStatus {
  isLoaded: boolean;
  isPlaying: boolean;
  position: number;
  duration: number;
  bufferedPosition: number;
  isBuffering: boolean;
  didJustFinish: boolean;
  error?: string;
  /** Track that changed (for remote playback when track changes on remote device) */
  trackChanged?: AudioTrack;
  /** New queue index (for remote playback when track changes on remote device) */
  newQueueIndex?: number;
}

/**
 * Callback for playback status updates
 */
export type PlaybackStatusCallback = (status: PlaybackStatus) => void;

/**
 * Platform-agnostic audio player interface
 */
export interface AudioPlayerAdapter {
  /**
   * Initialize the audio player
   */
  initialize(): Promise<void>;

  /**
   * Load and start playing a track
   */
  loadTrack(track: AudioTrack, callback: PlaybackStatusCallback): Promise<void>;

  /**
   * Resume playback
   */
  play(): Promise<void>;

  /**
   * Pause playback
   */
  pause(): Promise<void>;

  /**
   * Stop playback
   */
  stop(): Promise<void>;

  /**
   * Seek to a specific position in seconds
   */
  seekTo(position: number): Promise<void>;

  /**
   * Set repeat mode
   */
  setRepeatMode(mode: RepeatMode): Promise<void>;

  /**
   * Get current playback status
   */
  getStatus(): Promise<PlaybackStatus | null>;

  /**
   * Clean up resources
   */
  destroy(): Promise<void>;

  /**
   * Update metadata for lock screen / media session
   */
  updateMetadata(track: AudioTrack, isPlaying: boolean): Promise<void>;
}
