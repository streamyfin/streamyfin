export const CONTROLS_TIMEOUT = 4000;

export const TRICKPLAY_TILE_WIDTH = 150;
export const TRICKPLAY_TILE_SCALE = 1.4;

export const SLIDER_SCALE_UP = 1.4;
export const SLIDER_SCALE_NORMAL = 1.0;

export const ANIMATION_DURATION = {
  CONTROLS_FADE: 300,
  SLIDER_SCALE: 300,
  SLIDER_SCALE_COMPLETE: 200,
} as const;

export const SLIDER_CONFIG = {
  HEIGHT: 10,
  THUMB_WIDTH: 0,
  BORDER_RADIUS: 100,
} as const;

export const SLIDER_THEME = {
  maximumTrackTintColor: "rgba(255,255,255,0.2)",
  minimumTrackTintColor: "#fff",
  cacheTrackTintColor: "rgba(255,255,255,0.3)",
  bubbleBackgroundColor: "#fff",
  bubbleTextColor: "#666",
  heartbeatColor: "#999",
} as const;
