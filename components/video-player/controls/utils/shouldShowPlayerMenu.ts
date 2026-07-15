/**
 * Whether the player's "..." menu (track selection, playback speed,
 * technical info) is available for the current playback.
 */
export function shouldShowPlayerMenu(options: {
  isTV: boolean;
  offline: boolean;
  isTranscoded?: boolean;
}): boolean {
  return !options.isTV;
}
