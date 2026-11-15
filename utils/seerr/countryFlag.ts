/** U+1F1E6, the regional indicator symbol for "A". */
const REGIONAL_INDICATOR_A = 0x1f1e6;

/**
 * The flag emoji of an ISO 3166-1 alpha-2 country code, or null when the code
 * is not two letters. The flag is made of two regional indicator symbols, so
 * nothing is fetched to draw it.
 */
export const countryFlagEmoji = (isoCode: string): string | null => {
  const code = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...Array.from(
      code,
      (letter) => REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 65,
    ),
  );
};
