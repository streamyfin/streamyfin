import {
  BITRATE_DETECTION_TTL_MS,
  DETECTED_BITRATE_RATIO,
  IN_NETWORK_MIN_BITRATE,
} from "@/constants/Bitrate";
import type { Settings } from "@/utils/atoms/settings";

/** How Auto turns what the server measures into a bitrate. */
export type AutoBitrateOptions = {
  /** The share of the measured rate a stream may take. */
  ratio: number;
  /** How long a detection is used before the server is measured again. */
  ttlMs: number;
  /** The least a client in the server's network is given; 0 gives none. */
  inNetworkMinBitrate: number;
};

type AutoBitrateSettings = Partial<
  Pick<
    Settings,
    "autoBitrateRatio" | "autoBitrateTtlMinutes" | "autoBitrateInNetworkMin"
  >
>;

/**
 * Auto's options from the settings, and jellyfin-web's choices where the
 * settings have none (saved before Auto had any, or not loaded yet).
 */
export const autoBitrateOptions = (
  settings: AutoBitrateSettings | null | undefined,
): AutoBitrateOptions => ({
  ratio: settings?.autoBitrateRatio ?? DETECTED_BITRATE_RATIO,
  ttlMs:
    settings?.autoBitrateTtlMinutes === undefined
      ? BITRATE_DETECTION_TTL_MS
      : settings.autoBitrateTtlMinutes * 60_000,
  inNetworkMinBitrate:
    settings?.autoBitrateInNetworkMin ?? IN_NETWORK_MIN_BITRATE,
});
