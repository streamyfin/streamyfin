/**
 * Whether the player's "..." menu (track selection, playback speed,
 * technical info) is available for the current playback.
 *
 * Shown on every non-TV device, including offline transcoded downloads:
 * those now ship external text-subtitle files, so there is always a track to
 * select. TV has its own navigation-based selectors and hides this menu.
 */
export function shouldShowPlayerMenu(options: { isTV: boolean }): boolean {
  return !options.isTV;
}
