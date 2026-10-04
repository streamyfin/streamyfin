/**
 * Height of the title logo on the phone detail pages, in layout points. The
 * parallax header reserves a slot this tall and the logo is drawn to fill it.
 */
export const LOGO_HEIGHT = 130;

/**
 * Longest side of an image sized to the box it covers, in physical pixels. A
 * backdrop covering a tall header on a 3x phone would otherwise come back
 * past 2600 pixels wide. 1920 keeps it close to sharp while the decoded
 * bitmap stays around 8 MB for a backdrop and under 15 MB for anything else.
 */
export const MAX_IMAGE_SIDE_PX = 1920;

/**
 * Tallest logo the app asks the server for, in physical pixels. Logos are
 * wide, so a height past this buys a bitmap several thousand pixels across
 * for a slot no screen draws that large.
 */
export const MAX_LOGO_HEIGHT_PX = 600;
