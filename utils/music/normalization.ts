import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  MUSIC_NORMALIZATION_MAX_VOLUME,
  type MusicNormalizationMode,
} from "@/constants/Music";

/**
 * The gains a track carries, in dB. `AlbumNormalizationGain` is inherited from
 * the album by Jellyfin 12 and is not in the SDK types yet. Both stay null
 * until the server has scanned the library.
 */
export type NormalizationGains = Pick<BaseItemDto, "NormalizationGain"> & {
  AlbumNormalizationGain?: number | null;
};

/** The same gains, under the names they ride on a queued player track. */
export interface TrackNormalizationGains {
  normalizationGain?: number;
  albumNormalizationGain?: number;
}

const usableGain = (gain: number | null | undefined): number | null =>
  typeof gain === "number" && Number.isFinite(gain) ? gain : null;

/**
 * Keeps only the gains worth sending to the native queue. 0 dB is a real
 * gain, so a missing one is left off instead of riding along as a placeholder
 * the bridge could hand back as a number.
 */
export const toTrackNormalizationGains = (
  item: NormalizationGains,
): TrackNormalizationGains => {
  const gains: TrackNormalizationGains = {};
  const track = usableGain(item.NormalizationGain);
  const album = usableGain(item.AlbumNormalizationGain);
  if (track !== null) gains.normalizationGain = track;
  if (album !== null) gains.albumNormalizationGain = album;
  return gains;
};

/** The gain to apply, in dB, or null when the track is to be left alone. */
export const resolveNormalizationGainDb = (
  gains: TrackNormalizationGains | null | undefined,
  mode: MusicNormalizationMode,
): number | null => {
  if (!gains) return null;
  const track = usableGain(gains.normalizationGain);
  if (mode === "track") return track;
  if (mode === "album") {
    return usableGain(gains.albumNormalizationGain) ?? track;
  }
  // Off, and any value a stored or plugin supplied setting should not hold.
  return null;
};

/** dB to the linear factor the player volume takes, never above the ceiling. */
export const gainDbToVolume = (gainDb: number): number =>
  Math.min(10 ** (gainDb / 20), MUSIC_NORMALIZATION_MAX_VOLUME);

/** The player volume for a track: its gain as a factor, or full volume. */
export const getNormalizationVolume = (
  gains: TrackNormalizationGains | null | undefined,
  mode: MusicNormalizationMode,
): number => {
  const gainDb = resolveNormalizationGainDb(gains, mode);
  return gainDb === null
    ? MUSIC_NORMALIZATION_MAX_VOLUME
    : gainDbToVolume(gainDb);
};
