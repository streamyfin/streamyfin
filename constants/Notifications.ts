/**
 * The plugin route a device's push registration is posted to, and deleted from
 * on sign out with the device id after it.
 */
export const PUSH_DEVICE_PATH = "/Streamyfin/device";

/**
 * How long a write of this device's registration may take before it is given up.
 * The writes run one after the other, so one the server never answers would hold
 * back every one after it.
 */
export const PUSH_REGISTRATION_TIMEOUT_MS = 15_000;
