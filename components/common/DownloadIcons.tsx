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

/** Use the smaller row glyph beside the season selector. */
export const SeasonDownloadIcon = () => (
  <HeaderIcon name='downloads' size={18} />
);
export const SeasonDownloadedIcon = () => (
  <HeaderIcon name='downloaded' tintColor={Colors.primary} size={18} />
);
