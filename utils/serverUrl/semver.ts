/** Strips whitespace and an optional leading `v` (`v2.1.0` → `2.1.0`). */
const normalize = (version: string): string =>
  version.trim().replace(/^v/i, "");

/**
 * Splits a dotted version into numeric segments, or returns null when the
 * string doesn't start with a number and therefore isn't a version we can
 * compare at all.
 */
const parseSegments = (version: string): number[] | null => {
  const segments = normalize(version).split(".");
  if (!Number.isFinite(Number.parseInt(segments[0] ?? "", 10))) return null;
  // Later segments fall back to 0 so pre-release suffixes are ignored
  // (`2.0.0-beta` → 2.0.0).
  return segments.map((segment) => Number.parseInt(segment, 10) || 0);
};

/**
 * Strict numeric "below" comparison for dotted versions.
 *
 * Avoids the string-comparison bug (`"1.9.9" < "2.0.0"` works by luck but
 * `"2.10.0" < "2.0.0"` is wrongly true). Non-numeric/pre-release suffixes on a
 * segment are ignored (e.g. `2.0.0-beta` → 2.0.0), and a leading `v` is
 * accepted.
 *
 * A version with no leading number is unknown, not old, and is reported as
 * NOT below the minimum. Jellyseerr's non-release builds report
 * `develop-<commit>`, which previously parsed to 0 and so failed every
 * minimum-version check — locking every develop/nightly/self-built server out
 * of the integration. This matches how the Jellyfin server check treats an
 * unparseable version (see `isSupportedVersion` in utils/jellyfin/checkServer).
 */
export function isVersionBelow(version: string, minimum: string): boolean {
  const a = parseSegments(version);
  const b = parseSegments(minimum);
  if (!a || !b) return false;

  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
