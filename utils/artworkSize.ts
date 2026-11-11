/**
 * Side of a square artwork sized on the window. It follows the window's short
 * side: from the width alone, a phone in landscape got a square as wide as the
 * screen, far taller than the window. A narrower window, split view or a
 * foldable, still shrinks it. `inset` takes off what the page puts on that side
 * next to the artwork, so the artwork itself fits; what goes under it can still
 * be a scroll away in landscape.
 */
export const squareArtworkSide = (
  window: { width: number; height: number },
  { ratio = 1, inset = 0 }: { ratio?: number; inset?: number },
): number => Math.max(0, Math.min(window.width, window.height) * ratio - inset);
