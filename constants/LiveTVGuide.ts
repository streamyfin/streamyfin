// The phone's Live TV guide (app/(auth)/(tabs)/.../livetv/guide.tsx). An hour
// takes this many points across, in the header and in every channel row.
export const LIVE_TV_GUIDE_HOUR_WIDTH = 200;

// The column of channel logos left of the programs.
export const LIVE_TV_GUIDE_CHANNEL_COLUMN_WIDTH = 64;

// A program's title follows the guide's left edge while the program is
// scrolled past it, and stops this far before the program's end. Closer, the
// title had less room than it needs and wrapped again on every scroll step.
export const LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH = 140;
