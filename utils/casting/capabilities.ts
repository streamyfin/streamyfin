/**
 * Chromecast device capability detection.
 *
 * The Cast SDK exposes a device's `modelName` but no codec-level capability API.
 * We map known model names to a capability profile and fall back to a conservative
 * baseline (H.264 / 1080p / stereo) for anything unrecognised — a baseline that
 * cannot produce an unplayable stream on any Cast receiver.
 */

/** Profile selection mode, surfaced as an advanced setting. */
export type ChromecastProfileMode = "auto" | "force-hevc" | "force-h264";

export interface ChromecastCapabilities {
  /** HEVC 8-bit (Main profile) decode support. */
  hevc: boolean;
  /** HEVC 10-bit (Main10) decode support. */
  hevc10bit: boolean;
  /** Maximum video resolution height. */
  maxResolution: 1080 | 2160;
  /** Maximum video bitrate in bits per second. */
  maxVideoBitrate: number;
  /** Maximum audio channels the receiver can output. */
  maxAudioChannels: number;
}

/** Minimal shape we need from the Cast SDK `Device` — keeps this module import-free. */
interface DeviceLike {
  modelName?: string;
}

/** Overrides derived from user settings. */
export interface CapabilityOverrides {
  profileMode: ChromecastProfileMode;
  /** Optional manual cap in bits per second. */
  maxBitrate?: number;
}

/**
 * Baseline for a 1st/2nd/3rd-gen Chromecast and any unrecognised device.
 * `maxVideoBitrate` is an initial estimate — see docs/chromecast-test-matrix.md.
 */
export const CONSERVATIVE_CAPABILITIES: ChromecastCapabilities = {
  hevc: false,
  hevc10bit: false,
  maxResolution: 1080,
  maxVideoBitrate: 8_000_000,
  maxAudioChannels: 2,
};

/** Known Cast devices keyed by `Device.modelName`. Unlisted models stay conservative. */
const CHROMECAST_REGISTRY: Record<string, ChromecastCapabilities> = {
  "Chromecast Ultra": {
    hevc: true,
    hevc10bit: false,
    maxResolution: 2160,
    maxVideoBitrate: 20_000_000,
    maxAudioChannels: 6,
  },
  "Chromecast with Google TV": {
    hevc: true,
    hevc10bit: true,
    maxResolution: 2160,
    maxVideoBitrate: 20_000_000,
    maxAudioChannels: 6,
  },
  "Google TV Streamer": {
    hevc: true,
    hevc10bit: true,
    maxResolution: 2160,
    maxVideoBitrate: 25_000_000,
    maxAudioChannels: 8,
  },
};

/**
 * Resolve the effective capabilities for a Cast device.
 * Registry lookup → conservative fallback → user overrides applied last.
 */
export const detectCapabilities = (
  device: DeviceLike | null,
  overrides: CapabilityOverrides,
): ChromecastCapabilities => {
  const base =
    (device?.modelName && CHROMECAST_REGISTRY[device.modelName]) ||
    CONSERVATIVE_CAPABILITIES;

  const caps: ChromecastCapabilities = { ...base };

  if (overrides.profileMode === "force-hevc") {
    caps.hevc = true;
  } else if (overrides.profileMode === "force-h264") {
    caps.hevc = false;
    caps.hevc10bit = false;
  }

  if (overrides.maxBitrate && overrides.maxBitrate > 0) {
    caps.maxVideoBitrate = Math.min(caps.maxVideoBitrate, overrides.maxBitrate);
  }

  return caps;
};
