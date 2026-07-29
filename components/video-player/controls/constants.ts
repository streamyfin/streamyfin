export const CONTROLS_CONSTANTS = {
  TIMEOUT: 4000,
  // Media time left when the next episode button appears. The countdown fill
  // spans the same window, so both must move together.
  NEXT_EPISODE_COUNTDOWN_MS: 10000,
  SCRUB_INTERVAL_MS: 30 * 1000, // 30 seconds in ms
  SCRUB_INTERVAL_TICKS: 10 * 10000000, // 10 seconds in ticks
  TILE_WIDTH: 150,
  PROGRESS_UNIT_MS: 1000, // 1 second in ms
  PROGRESS_UNIT_TICKS: 10000000, // 1 second in ticks
  LONG_PRESS_INITIAL_SEEK: 30,
  LONG_PRESS_ACCELERATION: 1.2,
  LONG_PRESS_MAX_ACCELERATION: 4,
  LONG_PRESS_INTERVAL: 300,
  SLIDER_DEBOUNCE_MS: 3,
} as const;

export const ICON_SIZES = {
  HEADER: 24,
  CENTER: 50,
} as const;

export const HEADER_LAYOUT = {
  CONTAINER_PADDING: 8, // p-2 = 8px (matches HeaderControls)
} as const;
