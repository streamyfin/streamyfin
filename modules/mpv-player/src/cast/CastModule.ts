import { type NativeModule, requireNativeModule } from "expo";
import type {
  CastDevice,
  CastMediaStatus,
  CastNativeEvents,
  CastSessionInfo,
  CastStateValue,
  OutputPickerOptions,
  PlayServicesStateValue,
  RemoteTargetState,
} from "./Cast.types";

export declare class CastNativeModule extends NativeModule<CastNativeEvents> {
  /** False on a TV, on Catalyst and on an Android without Play Services. */
  isAvailable(): boolean;
  getCastState(): CastStateValue | null;
  getPlayServicesState(): PlayServicesStateValue | null;
  /** Absent from the tvOS stub, and called without isAvailable() first. */
  showPlayServicesErrorDialog?(state: PlayServicesStateValue): Promise<void>;
  getDevices(): CastDevice[];
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  getCurrentSession(): CastSessionInfo | null;
  getRemoteTarget(): RemoteTargetState;
  /** False when discovery does not know the device; otherwise the state follows the session events. */
  connectToDevice(deviceId: string): Promise<boolean>;
  /** Ends the session, or a connection the SDK has not started yet. */
  disconnect(stopPlayback: boolean): Promise<void>;
  /** The connected receiver's own volume, 0 to 1; the state follows what the SDK reports back. */
  setTargetVolume(level: number): Promise<void>;
  setTargetMuted(muted: boolean): Promise<void>;
  showCastDialog(): Promise<boolean>;
  showExpandedControls(): Promise<boolean>;
  /** The output sheet: true once on screen, false on a TV or a Mac, which have none. */
  presentOutputPicker(options: OutputPickerOptions): Promise<boolean>;
  dismissOutputPicker(): Promise<void>;
  addChannel(
    namespace: string,
  ): Promise<{ namespace: string; connected: boolean }>;
  removeChannel(namespace: string): Promise<void>;
  sendMessage(namespace: string, message: string): Promise<void>;
  /** Transport calls name the session they were meant for; another current session ignores them. */
  getMediaStatus(sessionId?: string): Promise<CastMediaStatus | null>;
  play(sessionId?: string): Promise<void>;
  pause(sessionId?: string): Promise<void>;
  stop(sessionId?: string): Promise<void>;
  seek(positionSeconds: number, sessionId?: string): Promise<void>;
}

// The Cast support ships with the module on every platform it is built for
// (tvOS gets a stub that answers unavailable), but a bundle can still load
// where the module is absent, web for one. Resolved optionally so importing
// this file never crashes, same pattern as NativePlayerPresentation.
let native: CastNativeModule | null = null;
try {
  native = requireNativeModule<CastNativeModule>("StreamyfinCast");
} catch {
  native = null;
}

export const CastNative: CastNativeModule | null = native;
