// Web shim: Chromecast uses the Google Cast native SDK, which has no
// react-native-web binding. On desktop there is no cast session, so every hook
// reports "no devices, not connected" and the cast button renders nothing —
// which is exactly the state the UI already handles on tvOS.

export enum CastState {
  NoDevicesAvailable = "noDevicesAvailable",
  NotConnected = "notConnected",
  Connecting = "connecting",
  Connected = "connected",
}

export enum PlayServicesState {
  Success = "success",
  Disabled = "disabled",
  Missing = "missing",
  Updating = "updating",
  UpdateRequired = "updateRequired",
  Invalid = "invalid",
}

export enum MediaStreamType {
  BUFFERED = "buffered",
  LIVE = "live",
  NONE = "none",
}

export const CastButton: React.FC<Record<string, unknown>> = () => null;

export const useCastDevice = () => null;
export const useDevices = () => [];
export const useMediaStatus = () => null;
export const useRemoteMediaClient = () => null;
export const useCastState = () => CastState.NoDevicesAvailable;
export const useCastSession = () => null;
export const useStreamPosition = () => 0;

const noop = async (): Promise<void> => undefined;

export const CastContext = {
  getPlayServicesState: async () => PlayServicesState.Missing,
  showPlayServicesErrorDialog: noop,
  showCastDialog: noop,
  showExpandedControls: noop,
  getCastState: async () => CastState.NoDevicesAvailable,
  onCastStateChanged: (_l: (s: CastState) => void) => () => undefined,
};

const GoogleCast = {
  getSessionManager: () => ({
    startSession: noop,
    endCurrentSession: noop,
    getCurrentCastSession: async () => null,
    onSessionStarted: (_l: () => void) => () => undefined,
    onSessionEnded: (_l: () => void) => () => undefined,
  }),
  getDiscoveryManager: () => ({
    startDiscovery: noop,
    stopDiscovery: noop,
  }),
  getCastState: async () => CastState.NoDevicesAvailable,
  showCastDialog: noop,
  showExpandedControls: noop,
};

export default GoogleCast;
