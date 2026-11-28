/**
 * How long, in ms, a play link from the TV home screen waits for the server
 * to say what the item is before it starts playback anyway. The lookup only
 * exists to keep a container out of the player, so it must not be able to
 * hold up a launch: the SDK's axios instance has no timeout of its own, and
 * an unreachable server would otherwise leave the screen black for as long as
 * the OS keeps the socket open.
 */
export const TOP_SHELF_PLAY_LOOKUP_TIMEOUT = 3000;

/** The Top Shelf poster's size in pixels: 2:3, as Apple TV draws it. */
export const TV_DISCOVERY_POSTER_WIDTH = 400;
export const TV_DISCOVERY_POSTER_HEIGHT = 600;

/** The height in pixels of the landscape tile Google TV's home screen draws. */
export const TV_DISCOVERY_LANDSCAPE_HEIGHT = 1080;
