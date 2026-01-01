// Remote player for controlling Jellyfin remote sessions

import type { Api } from "@jellyfin/sdk";
import {
  GeneralCommandType,
  PlayCommand,
  PlaystateCommand,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import type { PlaybackStatus, PlaybackStatusCallback } from "../player.types";
import type { AudioTrack, RepeatMode } from "../types";
import type {
  BaseAudioPlayer,
  PlayerState,
  PlayerType,
} from "./BaseAudioPlayer";

/**
 * RemotePlayer controls Jellyfin remote sessions
 * Does not actually play audio locally, just sends commands to remote device
 */
export class RemotePlayer implements BaseAudioPlayer {
  private sessionId: string;
  private api: Api;
  private currentState: {
    track: AudioTrack | null;
    position: number;
    isPlaying: boolean;
    queue: AudioTrack[];
    queueIndex: number;
    repeatMode: RepeatMode;
    shuffleEnabled: boolean;
    duration: number;
  } = {
    track: null,
    position: 0,
    isPlaying: false,
    queue: [],
    queueIndex: 0,
    repeatMode: "off",
    shuffleEnabled: false,
    duration: 0,
  };

  private callback: PlaybackStatusCallback | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private failedPollCount = 0;
  private readonly MAX_FAILED_POLLS = 5;
  isInitialized = false;

  constructor(sessionId: string, api: Api) {
    this.sessionId = sessionId;
    this.api = api;
  }

  getPlayerType(): PlayerType {
    return "remote";
  }

  canHandleTrack(_track: AudioTrack): boolean {
    // Remote player can handle any track that Jellyfin supports
    return true;
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * Internal method to send play command to remote session
   */
  private async sendPlayCommand(
    _track: AudioTrack,
    queue: AudioTrack[],
    queueIndex: number,
    position: number,
  ): Promise<void> {
    const itemIds = queue.map((t) => t.jellyfinItem.Id!);

    if (itemIds.length === 0) {
      console.error("[RemotePlayer] Cannot play: queue is empty!");
      throw new Error("Cannot play: queue is empty");
    }

    try {
      await getSessionApi(this.api).play({
        sessionId: this.sessionId,
        itemIds,
        playCommand: PlayCommand.PlayNow,
        startIndex: queueIndex,
        startPositionTicks: Math.floor(position * 10000000),
      });
    } catch (error) {
      console.error("[RemotePlayer] Error sending play command:", error);
      throw error;
    }
  }

  async loadTrack(
    track: AudioTrack,
    callback: PlaybackStatusCallback,
  ): Promise<void> {
    this.callback = callback;
    this.currentState.track = track;

    // Reset position to 0 for new tracks
    // Position will only be non-zero when resuming playback after switching players
    const startPosition = 0;
    this.currentState.position = startPosition;

    // Send play command to remote session
    await this.sendPlayCommand(
      track,
      this.currentState.queue,
      this.currentState.queueIndex,
      startPosition,
    );

    // Start polling for state sync
    this.startPolling();

    // Poll for track to load (workaround for JellyLMS not honoring startPositionTicks)
    await this.waitForTrackLoad(track);
  }

  private async waitForTrackLoad(track: AudioTrack): Promise<void> {
    const expectedTrackId = track.jellyfinItem.Id;
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max

    return new Promise<void>((resolve) => {
      const interval = setInterval(async () => {
        try {
          attempts++;

          const sessionInfo = await getSessionApi(this.api).getSessions();
          const session = sessionInfo.data.find((s) => s.Id === this.sessionId);

          if (!session) {
            console.warn("[RemotePlayer] Session not found while polling");
            clearInterval(interval);
            // Emit error but don't reject to allow graceful degradation
            this.emitError("session_not_found");
            resolve();
            return;
          }

          const nowPlayingId = session.NowPlayingItem?.Id;
          if (nowPlayingId === expectedTrackId) {
            clearInterval(interval);

            // Set duration from the now playing item
            if (session.NowPlayingItem?.RunTimeTicks) {
              this.currentState.duration =
                session.NowPlayingItem.RunTimeTicks / 10000000;
            }

            // Seek to position if needed
            if (this.currentState.position > 0) {
              await this.seekTo(this.currentState.position);
            }

            // Always pause after loading since PlayCommand.PlayNow starts playback
            // The AudioController will explicitly call play() if it wants playback to start
            await this.pause();

            resolve();
          } else if (attempts >= maxAttempts) {
            console.error(
              "[RemotePlayer] Track load timeout - remote device did not load track in time",
            );
            clearInterval(interval);
            // Emit error but don't reject to allow graceful degradation
            this.emitError("track_load_timeout");
            resolve();
          }
        } catch (error) {
          console.error("[RemotePlayer] Error polling for track load:", error);
          clearInterval(interval);
          // Emit error but don't reject to allow graceful degradation
          this.emitError("track_load_error");
          resolve();
        }
      }, 100);
    });
  }

  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      await this.pollRemoteState();
    }, 1000); // Poll every second
  }

  private async pollRemoteState(): Promise<void> {
    try {
      const sessionInfo = await getSessionApi(this.api).getSessions();
      const session = sessionInfo.data.find((s) => s.Id === this.sessionId);

      if (!session) {
        console.warn("[RemotePlayer] Remote session not found");
        this.failedPollCount++;
        if (this.failedPollCount >= this.MAX_FAILED_POLLS) {
          this.emitError("remote_disconnected");
        }
        return;
      }

      this.failedPollCount = 0;

      // Sync playback state from remote session
      const nowPlaying = session.NowPlayingItem;
      const playState = session.PlayState;

      // Check if track changed on remote
      let trackChanged: typeof this.currentState.track | undefined;
      let newQueueIndex: number | undefined;

      if (
        nowPlaying &&
        nowPlaying.Id !== this.currentState.track?.jellyfinItem?.Id
      ) {
        // Find the track in our queue
        const newIndex = this.currentState.queue.findIndex(
          (track) => track.jellyfinItem.Id === nowPlaying.Id,
        );

        if (newIndex !== -1) {
          this.currentState.track = this.currentState.queue[newIndex];
          this.currentState.queueIndex = newIndex;
          this.currentState.duration = nowPlaying.RunTimeTicks
            ? nowPlaying.RunTimeTicks / 10000000
            : 0;
          // Signal track change to controller
          trackChanged = this.currentState.track;
          newQueueIndex = newIndex;
        }
      }

      // Update playback state
      if (playState) {
        this.currentState.isPlaying = !playState.IsPaused;
        this.currentState.position = playState.PositionTicks
          ? playState.PositionTicks / 10000000
          : this.currentState.position;
      }

      // Notify callback
      if (this.callback) {
        this.callback({
          isLoaded: true,
          isPlaying: this.currentState.isPlaying,
          position: this.currentState.position,
          duration: this.currentState.duration,
          bufferedPosition: this.currentState.position,
          isBuffering: false,
          didJustFinish: false,
          trackChanged: trackChanged ?? undefined,
          newQueueIndex,
        });
      }
    } catch (error) {
      console.error("[RemotePlayer] Error polling remote session:", error);
      this.failedPollCount++;
      if (this.failedPollCount >= this.MAX_FAILED_POLLS) {
        // Stop polling to avoid endless failed requests
        this.stopPolling();
        this.emitError("remote_disconnected");
      }
    }
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private emitError(error: string): void {
    if (this.callback) {
      this.callback({
        isLoaded: false,
        isPlaying: false,
        position: 0,
        duration: 0,
        bufferedPosition: 0,
        isBuffering: false,
        didJustFinish: false,
        error,
      });
    }
  }

  async play(): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.Unpause,
      });
      this.currentState.isPlaying = true;
    } catch (error) {
      console.error("[RemotePlayer] Failed to play:", error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.Pause,
      });
      this.currentState.isPlaying = false;
    } catch (error) {
      console.error("[RemotePlayer] Failed to pause:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.Stop,
      });
      this.currentState.isPlaying = false;
    } catch (error) {
      console.error("[RemotePlayer] Failed to stop:", error);
      throw error;
    }
  }

  /**
   * Skip to next track on remote device
   * This is more efficient than loadTrack() for remote playback
   */
  async skipToNext(): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.NextTrack,
      });
    } catch (error) {
      console.error("[RemotePlayer] Failed to skip to next:", error);
      throw error;
    }
  }

  /**
   * Skip to previous track on remote device
   * This is more efficient than loadTrack() for remote playback
   */
  async skipToPrevious(): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.PreviousTrack,
      });
    } catch (error) {
      console.error("[RemotePlayer] Failed to skip to previous:", error);
      throw error;
    }
  }

  async seekTo(position: number): Promise<void> {
    try {
      await getSessionApi(this.api).sendPlaystateCommand({
        sessionId: this.sessionId,
        command: PlaystateCommand.Seek,
        seekPositionTicks: Math.floor(position * 10000000),
      });
      this.currentState.position = position;
    } catch (error) {
      console.error("[RemotePlayer] Failed to seek:", error);
      throw error;
    }
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    // Jellyfin doesn't have a direct repeat mode command
    // This would need to be handled at the controller level
    this.currentState.repeatMode = mode;
  }

  async setVolume(volume: number): Promise<void> {
    try {
      console.log(
        `[RemotePlayer] Setting volume to ${volume} for session ${this.sessionId}`,
      );
      await getSessionApi(this.api).sendFullGeneralCommand({
        sessionId: this.sessionId,
        generalCommand: {
          Name: GeneralCommandType.SetVolume,
          Arguments: {
            Volume: Math.round(volume).toString(),
          },
        },
      });
      console.log("[RemotePlayer] Volume set successfully");
    } catch (error) {
      console.error("[RemotePlayer] Failed to set volume:", error);
      throw error;
    }
  }

  async getStatus(): Promise<PlaybackStatus | null> {
    return {
      isLoaded: this.currentState.track !== null,
      isPlaying: this.currentState.isPlaying,
      position: this.currentState.position,
      duration: this.currentState.duration,
      bufferedPosition: this.currentState.position,
      isBuffering: false,
      didJustFinish: false,
    };
  }

  async destroy(): Promise<void> {
    // Stop polling
    this.stopPolling();

    // Stop playback on remote
    try {
      await this.stop();
    } catch (error) {
      console.error("[RemotePlayer] Error stopping remote playback:", error);
    }

    this.callback = null;
  }

  async suspend(): Promise<PlayerState> {
    // Try to get current state from remote session for most accurate position
    // Fall back to cached state if API call fails
    try {
      const sessionInfo = await getSessionApi(this.api).getSessions();
      const session = sessionInfo.data.find((s) => s.Id === this.sessionId);

      if (session?.PlayState) {
        if (session.PlayState.PositionTicks) {
          this.currentState.position =
            session.PlayState.PositionTicks / 10000000;
        }
        this.currentState.isPlaying = !session.PlayState.IsPaused;
      }
    } catch (error) {
      console.warn(
        "[RemotePlayer] Failed to get remote state during suspend, using cached state:",
        error,
      );
      // Continue with cached state - better than failing the suspend entirely
    }

    if (!this.currentState.track) {
      throw new Error("Cannot suspend: no track loaded");
    }

    return {
      track: this.currentState.track,
      position: this.currentState.position,
      isPlaying: this.currentState.isPlaying,
      queue: this.currentState.queue,
      queueIndex: this.currentState.queueIndex,
      repeatMode: this.currentState.repeatMode,
      shuffleEnabled: this.currentState.shuffleEnabled,
    };
  }

  async resume(state: PlayerState): Promise<void> {
    this.currentState = {
      track: state.track,
      position: state.position,
      isPlaying: state.isPlaying,
      queue: state.queue,
      queueIndex: state.queueIndex,
      repeatMode: state.repeatMode,
      shuffleEnabled: state.shuffleEnabled,
      duration: 0,
    };

    // Send play command to load track on remote session
    await this.sendPlayCommand(
      state.track,
      state.queue,
      state.queueIndex,
      state.position,
    );

    // Start polling for state sync (but without callback yet)
    // The callback will be set when AudioController calls methods that need status updates
    this.startPolling();

    // Wait for track to load
    await this.waitForTrackLoad(state.track);

    // Restore playback state
    if (state.isPlaying) {
      await this.play();
    }
    // If not playing, it's already paused from waitForTrackLoad()
  }

  async updateMetadata(_track: AudioTrack, _isPlaying: boolean): Promise<void> {
    // Remote player doesn't need to update local metadata
    // The remote device handles its own metadata
  }

  // Helper methods
  updateQueue(queue: AudioTrack[], queueIndex: number): void {
    this.currentState.queue = queue;
    this.currentState.queueIndex = queueIndex;
  }

  /**
   * Set the playback status callback
   * Used by AudioController to receive position updates after player switching
   */
  setCallback(callback: PlaybackStatusCallback): void {
    this.callback = callback;
  }
}
