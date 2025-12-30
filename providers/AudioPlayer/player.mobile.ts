// Mobile player implementation using expo-av with native media session controls
import {
  Audio,
  type AVPlaybackStatus,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from "expo-av";
import * as MediaControls from "@/modules/expo-media-controls";
import type {
  AudioPlayerAdapter,
  PlaybackStatus,
  PlaybackStatusCallback,
} from "./player.types";
import type { AudioTrack, RepeatMode } from "./types";

export class MobileAudioPlayer implements AudioPlayerAdapter {
  private sound: Audio.Sound | null = null;
  private currentCallback: PlaybackStatusCallback | null = null;
  private currentRepeatMode: RepeatMode = "off";
  isInitialized = false;

  async initialize(): Promise<void> {
    try {
      // Configure audio mode for background playback with native lock screen controls
      await Audio.setAudioModeAsync({
        staysActiveInBackground: true, // Keeps playing when app is backgrounded
        playsInSilentModeIOS: true, // Allows playback when phone is on silent
        interruptionModeIOS: InterruptionModeIOS.DuckOthers, // Properly handles audio interruptions on iOS
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers, // Properly handles audio interruptions (notifications, etc.) on Android
        playThroughEarpieceAndroid: false,
      });

      this.isInitialized = true;
    } catch (error) {
      console.error("[MobileAudioPlayer] Error initializing:", error);
      throw error;
    }
  }

  private handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!this.currentCallback) return;

    if (!status.isLoaded) {
      if ("error" in status && status.error) {
        this.currentCallback({
          isLoaded: false,
          isPlaying: false,
          position: 0,
          duration: 0,
          bufferedPosition: 0,
          isBuffering: false,
          didJustFinish: false,
          error: status.error,
        });
      }
      return;
    }

    const playbackStatus: PlaybackStatus = {
      isLoaded: true,
      isPlaying: status.isPlaying,
      position: status.positionMillis / 1000,
      duration: (status.durationMillis || 0) / 1000,
      bufferedPosition: (status.playableDurationMillis || 0) / 1000,
      isBuffering: status.isBuffering,
      didJustFinish: status.didJustFinish,
    };

    this.currentCallback(playbackStatus);
  };

  async loadTrack(
    track: AudioTrack,
    callback: PlaybackStatusCallback,
  ): Promise<void> {
    try {
      // Unload previous sound BEFORE setting new callback to prevent cross-contamination
      if (this.sound) {
        await this.sound.unloadAsync();
        this.sound = null;
      }

      // Now set the new callback after old sound is gone
      this.currentCallback = callback;

      // Create and load new sound (shouldPlay: false to let controller decide when to play)
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        {
          shouldPlay: false,
          isLooping: this.currentRepeatMode === "one",
          progressUpdateIntervalMillis: 500, // Update position every 500ms for smooth UI updates
          // positionMillis: 0,
          // isMuted: false,
          // volume: 1.0,
          // rate: 1.0,
          // shouldCorrectPitch: true,
        },
        this.handlePlaybackStatusUpdate,
      );

      this.sound = sound;

      // Set metadata for lock screen (iOS automatically shows this, Android via expo-av's native integration)
      // The track metadata is automatically extracted from the audio file or can be set via:
      // On iOS: Uses AVPlayer's nowPlayingInfo
      // On Android: Uses MediaSession
    } catch (error) {
      console.error("[MobileAudioPlayer] Error loading track:", error);
      throw error;
    }
  }

  async play(): Promise<void> {
    if (this.sound) {
      await this.sound.playAsync();
    }
  }

  async pause(): Promise<void> {
    if (this.sound) {
      await this.sound.pauseAsync();
    }
  }

  async stop(): Promise<void> {
    if (this.sound) {
      await this.sound.stopAsync();
    }
  }

  async seekTo(position: number): Promise<void> {
    if (this.sound) {
      await this.sound.setPositionAsync(position * 1000);
    }
  }

  async setRepeatMode(mode: RepeatMode): Promise<void> {
    this.currentRepeatMode = mode;

    if (this.sound) {
      // expo-av only supports single track repeat, not queue repeat
      // Queue repeat and album repeat are handled at the provider level
      const shouldLoop = mode === "one";
      await this.sound.setIsLoopingAsync(shouldLoop);
    }
  }

  async getStatus(): Promise<PlaybackStatus | null> {
    if (!this.sound) return null;

    try {
      const status = await this.sound.getStatusAsync();

      if (!status.isLoaded) return null;

      return {
        isLoaded: true,
        isPlaying: status.isPlaying,
        position: status.positionMillis / 1000,
        duration: (status.durationMillis || 0) / 1000,
        bufferedPosition: (status.playableDurationMillis || 0) / 1000,
        isBuffering: status.isBuffering,
        didJustFinish: status.didJustFinish,
      };
    } catch (error) {
      console.error("[MobileAudioPlayer] Error getting status:", error);
      return null;
    }
  }

  async destroy(): Promise<void> {
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }
    this.currentCallback = null;
  }

  async updateMetadata(track: AudioTrack, isPlaying: boolean): Promise<void> {
    try {
      const status = await this.getStatus();

      await MediaControls.updateNowPlaying({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        duration: status?.duration || 0,
        position: status?.position || 0,
        isPlaying,
      });

      console.log(
        "[MobileAudioPlayer] Lock screen metadata updated:",
        track.title,
      );
    } catch (error) {
      console.error("[MobileAudioPlayer] Error updating metadata:", error);
    }
  }
}
