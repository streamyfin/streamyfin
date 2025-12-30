import {
  EventEmitter,
  type EventSubscription,
  NativeModulesProxy,
  requireNativeModule,
} from "expo-modules-core";
import { Platform } from "react-native";

type Subscription = EventSubscription;

// Import the native module or web fallback
const MediaControlsModule = Platform.select({
  web: () => require("./MediaControlsModule.web").default,
  default: () => requireNativeModule("MediaControls"),
})();

export interface NowPlayingMetadata {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration: number;
  position: number;
  isPlaying: boolean;
}

export type MediaControlEvent =
  | "play"
  | "pause"
  | "stop"
  | "next"
  | "previous"
  | "seekTo"
  | "volumeChange"
  | "remoteVolumeChange";

export interface SeekToEvent {
  position: number;
}

export interface VolumeChangeEvent {
  volume: number;
}

export interface RemoteVolumeChangeEvent {
  command: "VolumeUp" | "VolumeDown" | "SetVolume";
  volume?: number; // Only present for SetVolume command
}

const emitter = new EventEmitter(
  MediaControlsModule ?? NativeModulesProxy.MediaControls,
);

/**
 * Update the now playing metadata displayed on lock screen and notification panel
 */
export async function updateNowPlaying(
  metadata: NowPlayingMetadata,
): Promise<void> {
  return await MediaControlsModule.updateNowPlaying(metadata);
}

/**
 * Clear the now playing metadata and remove lock screen controls
 */
export async function clearNowPlaying(): Promise<void> {
  return await MediaControlsModule.clearNowPlaying();
}

/**
 * Listen to media control events from lock screen and notification panel
 */
export function addListener(
  event: "seekTo",
  listener: (event?: SeekToEvent) => void,
): Subscription;
export function addListener(
  event: "volumeChange",
  listener: (event?: VolumeChangeEvent) => void,
): Subscription;
export function addListener(
  event: "remoteVolumeChange",
  listener: (event?: RemoteVolumeChangeEvent) => void,
): Subscription;
export function addListener(
  event: Exclude<
    MediaControlEvent,
    "seekTo" | "volumeChange" | "remoteVolumeChange"
  >,
  listener: () => void,
): Subscription;
export function addListener(
  event: MediaControlEvent,
  listener: (event?: any) => void,
): Subscription {
  return (emitter as any).addListener(event, listener);
}

/**
 * Remove a specific listener
 */
export function removeListener(subscription: Subscription): void {
  subscription.remove();
}

/**
 * Remove all listeners for a specific event
 */
export function removeAllListeners(event: MediaControlEvent): void {
  (emitter as any).removeAllListeners(event);
}

/**
 * Enable volume monitoring (only needed when casting to remote session)
 */
export async function enableVolumeMonitoring(): Promise<void> {
  return await MediaControlsModule.enableVolumeMonitoring();
}

/**
 * Disable volume monitoring
 */
export async function disableVolumeMonitoring(): Promise<void> {
  return await MediaControlsModule.disableVolumeMonitoring();
}

/**
 * Enable remote volume control (creates Android system volume bar for remote device)
 */
export async function enableRemoteVolume(initialVolume: number): Promise<void> {
  return await MediaControlsModule.enableRemoteVolume(initialVolume);
}

/**
 * Disable remote volume control (removes Android system volume bar)
 */
export async function disableRemoteVolume(): Promise<void> {
  return await MediaControlsModule.disableRemoteVolume();
}

/**
 * Update the remote volume provider's current volume (syncs UI)
 */
export async function updateRemoteVolume(volume: number): Promise<void> {
  return await MediaControlsModule.updateRemoteVolume(volume);
}
