// Web shim: only the handful of getters Streamyfin actually calls are
// implemented. Everything else resolves through the Proxy below to a harmless
// no-op so an unanticipated call cannot crash the desktop build.

const browserName = (): string => {
  if (typeof navigator === "undefined") return "Streamyfin Desktop";
  const ua = navigator.userAgent;
  if (ua.includes("Electron")) return "Streamyfin Desktop";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Streamyfin Desktop";
};

export const getDeviceNameSync = (): string => browserName();
export const getDeviceName = async (): Promise<string> => browserName();
export const getUniqueIdSync = (): string => "streamyfin-desktop";
export const getUniqueId = async (): Promise<string> => "streamyfin-desktop";
export const getSystemName = (): string => "Web";
export const getSystemVersion = (): string => "1";
export const getModel = (): string => "Desktop";
export const isTablet = (): boolean => false;
export const isEmulatorSync = (): boolean => false;

/** Bytes of free disk space; the browser cannot know, so report generously. */
export const getFreeDiskStorage = async (): Promise<number> =>
  Number.MAX_SAFE_INTEGER;
export const getFreeDiskStorageSync = (): number => Number.MAX_SAFE_INTEGER;
export const getTotalDiskCapacity = async (): Promise<number> =>
  Number.MAX_SAFE_INTEGER;
export const getTotalDiskCapacitySync = (): number => Number.MAX_SAFE_INTEGER;

const implemented: Record<string, unknown> = {
  getDeviceNameSync,
  getDeviceName,
  getUniqueIdSync,
  getUniqueId,
  getSystemName,
  getSystemVersion,
  getModel,
  isTablet,
  isEmulatorSync,
  getFreeDiskStorage,
  getFreeDiskStorageSync,
  getTotalDiskCapacity,
  getTotalDiskCapacitySync,
};

const DeviceInfo = new Proxy(implemented, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    // Unknown getter: sync callers get null, async callers get a resolved null.
    return prop.endsWith("Sync") ? () => null : async () => null;
  },
});

export default DeviceInfo;
