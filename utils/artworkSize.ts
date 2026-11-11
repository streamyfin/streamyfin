/**
 * Side of a square artwork sized on the window. It follows the window's short
 * side: from the width alone, a phone in landscape got a square as wide as the
 * screen, taller than the window, with the title and controls pushed below.
 * A narrower window, split view or a foldable, still shrinks it.
 */
export const squareArtworkSide = (
  window: { width: number; height: number },
  { ratio = 1, inset = 0 }: { ratio?: number; inset?: number },
): number => Math.max(0, Math.min(window.width, window.height) * ratio - inset);
