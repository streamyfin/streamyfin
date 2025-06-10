/**
 * Convert bits to megabits or gigabits
 *
 * Return nice looking string
 * If under 1000Mb, return XXXMB, else return X.XGB
 */

export function convertBitsToMegabitsOrGigabits(bits?: number | null): string {
  if (!bits) return "0MB";

  const megabits = bits / 1000000;

  if (megabits < 1000) {
    return `${Math.round(megabits)}MB`;
  }
  const gigabits = megabits / 1000;
  return `${gigabits.toFixed(1)}GB`;
}
