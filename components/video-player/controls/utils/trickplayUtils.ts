import { TRICKPLAY_TILE_SCALE, TRICKPLAY_TILE_WIDTH } from "../constants";

export const calculateTrickplayDimensions = (aspectRatio: number) => {
  const tileWidth = TRICKPLAY_TILE_WIDTH;
  const tileHeight = TRICKPLAY_TILE_WIDTH / aspectRatio;

  return {
    tileWidth,
    tileHeight,
    scaledWidth: tileWidth * TRICKPLAY_TILE_SCALE,
    scaledHeight: tileHeight * TRICKPLAY_TILE_SCALE,
  };
};

export const formatTimeForBubble = (time: {
  hours: number;
  minutes: number;
  seconds: number;
}) => {
  return `${time.hours > 0 ? `${time.hours}:` : ""}${
    time.minutes < 10 ? `0${time.minutes}` : time.minutes
  }:${time.seconds < 10 ? `0${time.seconds}` : time.seconds}`;
};
