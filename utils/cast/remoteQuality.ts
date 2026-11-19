import {
  CHROMECAST_STICK_AUTO_MAX_BITRATE,
  CHROMECAST_STICK_MODEL,
} from "@/constants/Cast";

/**
 * The bitrate Auto hands a receiver of this model: what the link measured,
 * held under the Chromecast stick's ceiling there, which also stands in for a
 * measure that failed.
 */
export const autoBitrateOn = (
  measured: number | undefined,
  model: string | null | undefined,
): number | undefined =>
  model === CHROMECAST_STICK_MODEL
    ? Math.min(
        measured ?? CHROMECAST_STICK_AUTO_MAX_BITRATE,
        CHROMECAST_STICK_AUTO_MAX_BITRATE,
      )
    : measured;
