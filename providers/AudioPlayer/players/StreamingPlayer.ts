// Streaming player for Jellyfin audio URLs
import { MobileAudioPlayer } from "../player.mobile";
import type { AudioTrack, RepeatMode } from "../types";
import type {
  BaseAudioPlayer,
  PlayerState,
  PlayerType,
} from "./BaseAudioPlayer";

/**
 * StreamingPlayer handles streaming audio from Jellyfin server
 * Extends MobileAudioPlayer with lifecycle management for transitions
 */
export class StreamingPlayer
  extends MobileAudioPlayer
  implements BaseAudioPlayer
{
  private currentState: {
    track: AudioTrack | null;
    position: number;
    isPlaying: boolean;
    queue: AudioTrack[];
    queueIndex: number;
    repeatMode: RepeatMode;
    shuffleEnabled: boolean;
  } = {
    track: null,
    position: 0,
    isPlaying: false,
    queue: [],
    queueIndex: 0,
    repeatMode: "off",
    shuffleEnabled: false,
  };

  getPlayerType(): PlayerType {
    return "streaming";
  }

  canHandleTrack(track: AudioTrack): boolean {
    // Streaming player can handle any track with a URL
    return !!track.url;
  }

  async suspend(): Promise<PlayerState> {
    // Get current playback status
    const status = await this.getStatus();

    if (!this.currentState.track) {
      throw new Error("Cannot suspend: no track loaded");
    }

    // Capture current state
    const state: PlayerState = {
      track: this.currentState.track,
      position: status?.position || 0,
      isPlaying: status?.isPlaying || false,
      queue: this.currentState.queue,
      queueIndex: this.currentState.queueIndex,
      repeatMode: this.currentState.repeatMode,
      shuffleEnabled: this.currentState.shuffleEnabled,
    };

    // Pause playback but don't destroy (will be destroyed separately)
    await this.pause();

    return state;
  }

  async resume(state: PlayerState): Promise<void> {
    // Store state
    this.currentState = {
      track: state.track,
      position: state.position,
      isPlaying: state.isPlaying,
      queue: state.queue,
      queueIndex: state.queueIndex,
      repeatMode: state.repeatMode,
      shuffleEnabled: state.shuffleEnabled,
    };

    // Load the track using existing callback (set by controller before resume)
    // or a no-op if no callback was set yet
    await this.loadTrackWithExistingCallback(state.track);

    // Seek to position
    await this.seekTo(state.position);

    // Restore playback state
    if (state.isPlaying) {
      await this.play();
    }

    // Restore repeat mode
    await this.setRepeatMode(state.repeatMode);
  }

  /**
   * Load a track without overwriting the existing callback
   * Used during resume when callback is already set by controller
   */
  private async loadTrackWithExistingCallback(
    track: AudioTrack,
  ): Promise<void> {
    this.currentState.track = track;
    // Use the parent's loadTrack but preserve callback set via setCallback
    // by passing a wrapper that uses the existing callback
    const existingCallback = (this as any).currentCallback;
    await super.loadTrack(track, existingCallback || (() => {}));
  }

  // Override loadTrack to update internal state
  async loadTrack(
    track: AudioTrack,
    callback: (status: any) => void,
  ): Promise<void> {
    this.currentState.track = track;
    return super.loadTrack(track, callback);
  }

  // Override setRepeatMode to update internal state
  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.currentState.repeatMode = mode;
    return super.setRepeatMode(mode);
  }

  // Helper methods to update state
  updateQueue(queue: AudioTrack[], queueIndex: number): void {
    this.currentState.queue = queue;
    this.currentState.queueIndex = queueIndex;
  }

  updateShuffleEnabled(enabled: boolean): void {
    this.currentState.shuffleEnabled = enabled;
  }

  updatePosition(position: number): void {
    this.currentState.position = position;
  }

  updateIsPlaying(isPlaying: boolean): void {
    this.currentState.isPlaying = isPlaying;
  }
}
