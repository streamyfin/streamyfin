/**
 * Strict numeric "below" comparison for dotted versions.
 *
 * Avoids the string-comparison bug (`"1.9.9" < "2.0.0"` works by luck but
 * `"2.10.0" < "2.0.0"` is wrongly true). Non-numeric/pre-release suffixes on a
 * segment are ignored (e.g. `2.0.0-beta` → 2.0.0).
 */
export function isVersionBelow(version: string, minimum: string): boolean {
  const parse = (v: string) =>
    v.split(".").map((segment) => Number.parseInt(segment, 10) || 0);

  const a = parse(version);
  const b = parse(minimum);
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
