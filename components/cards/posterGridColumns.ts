/**
 * Columns of a poster grid on a phone or a tablet, from the window's width. The
 * library, collection and watchlist pages share it, so each picks a new count
 * when the window changes (a rotation, split view). TV lays its grids out
 * itself.
 */
export const posterGridColumns = (windowWidth: number): number => {
  if (windowWidth < 300) return 2;
  if (windowWidth < 500) return 3;
  if (windowWidth < 800) return 5;
  if (windowWidth < 1000) return 6;
  if (windowWidth < 1500) return 7;
  return 6;
};
