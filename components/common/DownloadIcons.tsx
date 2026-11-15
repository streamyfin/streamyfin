import { Colors } from "@/constants/Colors";
import { HeaderIcon } from "./HeaderIcon";

/**
 * Keep the component types passed to `DownloadItems` stable across download
 * updates. Inline definitions remount the glyph on every parent render,
 * making the download buttons flicker.
 */
export const SingleItemDownloadIcon = () => <HeaderIcon name='downloads' />;
export const SingleItemDownloadedIcon = () => (
  <HeaderIcon name='downloaded' tintColor={Colors.primary} />
);

/** The smaller row glyph beside the season selector, for both states. */
const SEASON_ICON_SIZE = 18;

export const SeasonDownloadIcon = () => (
  <HeaderIcon name='downloads' size={SEASON_ICON_SIZE} />
);
export const SeasonDownloadedIcon = () => (
  <HeaderIcon
    name='downloaded'
    tintColor={Colors.primary}
    size={SEASON_ICON_SIZE}
  />
);
