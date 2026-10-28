import { type NativeModule, requireNativeModule } from "expo";
import type {
  CastDevice,
  CastMediaStatus,
  CastNativeEvents,
  CastSessionInfo,
  CastStateValue,
  PlayServicesStateValue,
} from "./Cast.types";

export declare class CastNativeModule extends NativeModule<CastNativeEvents> {
  /** False on a TV, on Catalyst and on an Android without Play Services. */
  isAvailable(): boolean;
  getCastState(): CastStateValue | null;
  getPlayServicesState(): PlayServicesStateValue | null;
  showPlayServicesErrorDialog(state: PlayServicesStateValue): Promise<void>;
  getDevices(): CastDevice[];
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  getCurrentSession(): CastSessionInfo | null;
  showCastDialog(): Promise<boolean>;
  showExpandedControls(): Promise<boolean>;
  addChannel(
    namespace: string,
  ): Promise<{ namespace: string; connected: boolean }>;
  removeChannel(namespace: string): Promise<void>;
  sendMessage(namespace: string, message: string): Promise<void>;
  getMediaStatus(): Promise<CastMediaStatus | null>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
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
