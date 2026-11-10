import { REMOTE_QUALITY_KNOWN_TARGETS_MAX } from "@/constants/Cast";
import { BITRATES } from "@/constants/Playback";
import type {
  RemoteTarget,
  RemoteTargetKind,
} from "@/modules/mpv-player/src/cast/Cast.types";

/** A receiver the app connected to, listed by the remote quality settings. */
export interface KnownTarget {
  id: string;
  name: string;
  kind: RemoteTargetKind;
}

/**
 * The bitrate a receiver plays at, as keys of `BITRATES`: per kind of target, then per known
 * target. The item page's quality is this device's own and caps no cast.
 */
export interface RemotePlaybackQuality {
  byKind: Partial<Record<RemoteTargetKind, string>>;
  byTarget: Record<string, string>;
  known: KnownTarget[];
}

export const NO_REMOTE_QUALITY: RemotePlaybackQuality = Object.freeze({
  byKind: {},
  byTarget: {},
  known: [],
});

/** The target's own cap, else its kind's, else none: the receiver then plays uncapped. */
export const maxBitrateFor = (
  target: RemoteTarget,
  quality: RemotePlaybackQuality | undefined,
): number | undefined => {
  const key = quality?.byTarget[target.id] ?? quality?.byKind[target.kind];
  return key === undefined
    ? undefined
    : BITRATES.find((bitrate) => bitrate.key === key)?.value;
};

/** A connection puts the target first, under its name of now; past the cap the oldest goes, its quality with it. */
export const rememberTarget = (
  quality: RemotePlaybackQuality,
  target: RemoteTarget,
): RemotePlaybackQuality => {
  const known = [
    { id: target.id, name: target.name, kind: target.kind },
    ...quality.known.filter((entry) => entry.id !== target.id),
  ].slice(0, REMOTE_QUALITY_KNOWN_TARGETS_MAX);
  const kept = new Set(known.map((entry) => entry.id));
  const byTarget = Object.fromEntries(
    Object.entries(quality.byTarget).filter(([id]) => kept.has(id)),
  );
  return { ...quality, known, byTarget };
};

/** No key goes back to the kind's quality. */
export const setTargetQuality = (
  quality: RemotePlaybackQuality,
  id: string,
  key: string | undefined,
): RemotePlaybackQuality => {
  const { [id]: _previous, ...others } = quality.byTarget;
  return {
    ...quality,
    byTarget: key === undefined ? others : { ...others, [id]: key },
  };
};

export const setKindQuality = (
  quality: RemotePlaybackQuality,
  kind: RemoteTargetKind,
  key: string,
): RemotePlaybackQuality => ({
  ...quality,
  byKind: { ...quality.byKind, [kind]: key },
});

export const forgetTarget = (
  quality: RemotePlaybackQuality,
  id: string,
): RemotePlaybackQuality => ({
  ...setTargetQuality(quality, id, undefined),
  known: quality.known.filter((entry) => entry.id !== id),
});
