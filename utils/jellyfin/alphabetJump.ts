/** Stands for every title that does not start with a letter. */
export const NON_LETTER = "#";

/** The alphabet picker's entries, in the order jellyfin-web shows them. */
export const ALPHABET: readonly string[] = [
  NON_LETTER,
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
];

export type AlphabetJumpParams = {
  nameStartsWithOrGreater?: string;
  nameLessThan?: string;
};

/**
 * The `GET /Items` name bounds that make a library sorted by name start at a
 * letter. The list is cut off before the letter instead of filtered down to
 * it, so paging carries on into the letters that follow.
 *
 * Both bounds compare against the sort name, which is why "The Matrix" is an
 * M title. `/Items` has taken them since long before Jellyfin 12; the three
 * 10.11 releases that got them wrong are left out by `supportsNameBounds`,
 * where the page decides whether to offer the jump at all.
 */
export const alphabetJumpParams = (
  letter: string | null,
  descending: boolean,
): AlphabetJumpParams => {
  const index = letter ? ALPHABET.indexOf(letter) : -1;
  if (index < 0) return {};

  if (descending) {
    // Z to A, a letter's titles lead once everything sorted after them is
    // gone. Nothing is cut for Z: an upper bound past "z" would have to assume
    // how the server's database collates punctuation.
    const next = ALPHABET[index + 1];
    return next ? { nameLessThan: next } : {};
  }

  // Digits and punctuation sort ahead of the letters, so A to Z the
  // non-letters are simply the top of the list.
  return letter === NON_LETTER
    ? {}
    : { nameStartsWithOrGreater: ALPHABET[index] };
};

/**
 * The entry at an index, held to the ends of the alphabet. An index that is
 * not a number at all (a rail not measured yet, a touch with no position)
 * counts as the first.
 */
export const letterAtIndex = (index: number): string =>
  ALPHABET[
    Math.min(
      Math.max(Number.isFinite(index) ? index : 0, 0),
      ALPHABET.length - 1,
    )
  ];

/**
 * The entry under a touch on a rail of this height that spreads the alphabet
 * evenly. A finger dragged past either end stays on the letter at that end.
 */
export const letterAtOffset = (offset: number, railHeight: number): string =>
  letterAtIndex(Math.floor((offset / railHeight) * ALPHABET.length));

/**
 * The top margin that keeps a rail off whatever fills the first `clearTop` of
 * its area, the list's own header. The rail is centred in what the margin
 * leaves and no taller than `maxRailHeight`, so the margin is only as large
 * as it takes: a rail whose centred place is already below the header gets
 * none and stays where it was.
 */
export const railMarginToClear = (
  areaHeight: number,
  clearTop: number,
  maxRailHeight: number,
): number =>
  Math.max(0, Math.min(clearTop, 2 * clearTop - areaHeight + maxRailHeight));
