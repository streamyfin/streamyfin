/**
 * How far a section's header slides down to stay in view while the section
 * scrolls past under a bar: none while the section's top is still below the
 * bar, then as far as the section has gone under it, up to the section's last
 * row. A worklet, so a scroll handler can call it on the UI thread.
 */
export const stickyHeaderOffset = ({
  viewTop,
  sectionOffset,
  sectionHeight,
  headerHeight,
  scroll,
  top,
}: {
  /** Where the scroll view starts on screen. */
  viewTop: number;
  /** The section's top within the scrolled content. */
  sectionOffset: number;
  sectionHeight: number;
  headerHeight: number;
  /** How far the content has scrolled. */
  scroll: number;
  /** The bottom edge of the bar the header stays under. */
  top: number;
}): number => {
  "worklet";
  const sectionTop = viewTop + sectionOffset - scroll;
  return Math.min(
    Math.max(top - sectionTop, 0),
    Math.max(sectionHeight - headerHeight, 0),
  );
};
