/**
 * Routes that make their own sound. Playback is pushed on top of the item
 * page, so the page stays mounted underneath it: anything the page plays
 * (theme music) has to check this rather than wait for an unmount.
 */
const PLAYBACK_SEGMENTS = new Set(["player", "now-playing"]);

export function isPlaybackRoute(segments: readonly string[]): boolean {
  return segments.some((segment) => PLAYBACK_SEGMENTS.has(segment));
}

export function isPlaybackActive(
  segments: readonly string[],
  nativePlayerActive: boolean,
): boolean {
  return nativePlayerActive || isPlaybackRoute(segments);
}
